import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppUser } from '../auth/types/app-user';
import { assertCanAccessWhatsapp } from '../common/utils/access';
import { RealtimeService } from '../realtime/realtime.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateBroadcastDto } from './dto/create-broadcast.dto';
import type {
  BroadcastJobDetail,
  BroadcastJobListItem,
  BroadcastJobResultItem,
  BroadcastJobResultRow,
  BroadcastJobRow,
  BroadcastMessageConfig,
  BroadcastRecipientStored,
} from './types/broadcast-job.types';
import {
  mapJobDetail,
  mapJobListItem,
  mapJobResult,
  parseBroadcastRecipients,
  parseMessageConfig,
} from './types/broadcast-job.types';
import { normalizePhoneNumber } from './utils/phone';
import {
  extractSendErrorMessage,
  WhatsappService,
} from './whatsapp.service';

const JOB_SELECT =
  'id, created_by, status, message_config, phone_numbers, total, sent, failed, cursor_index, error, created_at, started_at, finished_at';

const RESULT_SELECT =
  'id, job_id, phone_number, success, conversation_id, message_id, error, created_at';

const PHONE_WARN_THRESHOLD = 2000;
const PROGRESS_EVERY_N = 5;
const PROGRESS_MIN_MS = 1000;
/** Fallback {{1}} en mode personalized si variable1 absent. */
const DEFAULT_VARIABLE1 = 'Client';

@Injectable()
export class WhatsappBroadcastJobsService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappBroadcastJobsService.name);
  /** Mutex in-process : un seul runner à la fois. */
  private running = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly whatsapp: WhatsappService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Boot cleanup : jobs `running` orphelins → failed (pas de resume = évite double Meta).
   * Les `pending` sont conservés et claimés au kick du worker.
   */
  async onModuleInit(): Promise<void> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.supabase
        .getClient()
        .from('whatsapp_broadcast_jobs')
        .update({
          status: 'failed',
          error: 'Interrupted by server restart',
          finished_at: now,
        })
        .eq('status', 'running')
        .select('id');

      if (error) {
        // Table absente tant que sql/041 n’est pas appliqué.
        this.logger.warn(
          `[BroadcastJobs] boot cleanup skipped: ${error.message}`,
        );
        return;
      }
      const n = (data ?? []).length;
      if (n > 0) {
        this.logger.warn(
          `[BroadcastJobs] boot cleanup: marked ${n} running job(s) as failed (interrupted)`,
        );
      }

      // Reprendre la file des pending après restart.
      this.kick();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[BroadcastJobs] onModuleInit: ${message}`);
    }
  }

  async createJob(
    dto: CreateBroadcastDto,
    user: AppUser,
  ): Promise<{ jobId: string; total: number; status: 'pending' }> {
    assertCanAccessWhatsapp(user);

    const templateName = dto.templateName.trim();
    if (!templateName) {
      throw new BadRequestException({ message: 'templateName requis' });
    }

    // Si les deux formes sont fournies → recipients (forme B) gagne.
    const useRecipients =
      Array.isArray(dto.recipients) && dto.recipients.length > 0;

    let storedPhones: string[] | BroadcastRecipientStored[];
    let personalized = false;
    let total = 0;

    if (useRecipients) {
      personalized = true;
      const recipients = this.normalizeAndDedupeRecipients(dto.recipients!);
      if (recipients.length === 0) {
        throw new BadRequestException({
          message: 'Aucun numéro WhatsApp valide.',
        });
      }
      storedPhones = recipients;
      total = recipients.length;
    } else {
      const phones = this.normalizeAndDedupePhones(dto.phoneNumbers ?? []);
      if (phones.length === 0) {
        throw new BadRequestException({
          message: 'Aucun numéro WhatsApp valide.',
        });
      }
      storedPhones = phones;
      total = phones.length;
    }

    if (total > PHONE_WARN_THRESHOLD) {
      this.logger.warn(
        `[BroadcastJobs] large job phones=${total} (threshold=${PHONE_WARN_THRESHOLD}) by=${user.id}`,
      );
    }

    const messageConfig: BroadcastMessageConfig = {
      templateName,
      templateLanguage: dto.templateLanguage?.trim() || 'fr',
      personalized,
      // Globaux uniquement en forme A (ignorés en mode personalized).
      variable1: personalized
        ? undefined
        : dto.variable1?.trim() || undefined,
      components:
        personalized || !dto.components?.length
          ? undefined
          : dto.components.map((c) => ({
              type: c.type,
              parameters: c.parameters.map((p) => ({
                type: p.type,
                text: p.text,
              })),
            })),
    };

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .insert({
        created_by: user.id,
        status: 'pending',
        message_config: messageConfig,
        phone_numbers: storedPhones,
        total,
        sent: 0,
        failed: 0,
        cursor_index: 0,
        error: null,
        created_at: now,
        started_at: null,
        finished_at: null,
      })
      .select(JOB_SELECT)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Création du job broadcast impossible.',
      });
    }

    const jobId = String((data as BroadcastJobRow).id);
    this.logger.log(
      `[BroadcastJobs] created jobId=${jobId} total=${total} personalized=${personalized} by=${user.id}`,
    );
    this.kick();

    return { jobId, total, status: 'pending' };
  }

  async listJobs(user: AppUser): Promise<{ items: BroadcastJobListItem[] }> {
    assertCanAccessWhatsapp(user);

    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .select(JOB_SELECT)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: ((data ?? []) as BroadcastJobRow[]).map(mapJobListItem),
    };
  }

  async getJob(
    jobId: string,
    user: AppUser,
  ): Promise<BroadcastJobDetail> {
    assertCanAccessWhatsapp(user);
    const row = await this.loadJobOrThrow(jobId);
    return mapJobDetail(row);
  }

  async listResults(
    jobId: string,
    user: AppUser,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ items: BroadcastJobResultItem[]; total: number }> {
    assertCanAccessWhatsapp(user);
    await this.loadJobOrThrow(jobId);

    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);

    const { data, error, count } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_job_results')
      .select(RESULT_SELECT, { count: 'exact' })
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: ((data ?? []) as BroadcastJobResultRow[]).map(mapJobResult),
      total: count ?? 0,
    };
  }

  async cancelJob(
    jobId: string,
    user: AppUser,
  ): Promise<{ ok: true; id: string; status: string }> {
    assertCanAccessWhatsapp(user);
    const row = await this.loadJobOrThrow(jobId);
    const status = String(row.status);

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      throw new ConflictException({
        message: `Job déjà terminé (status=${status}).`,
      });
    }

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .update({
        status: 'cancelled',
        finished_at: status === 'pending' ? now : null,
        error: status === 'pending' ? 'Cancelled before start' : null,
      })
      .eq('id', jobId)
      .in('status', ['pending', 'running'])
      .select(JOB_SELECT)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new ConflictException({
        message: 'Impossible d’annuler ce job (status changé).',
      });
    }

    const updated = data as BroadcastJobRow;
    this.logger.log(`[BroadcastJobs] cancel requested jobId=${jobId}`);

    // pending → done immédiat ; running → worker finalise entre numéros.
    if (String(updated.status) === 'cancelled' && updated.finished_at) {
      this.emitDone(updated);
    }

    return { ok: true, id: jobId, status: String(updated.status) };
  }

  /** Démarre le worker si idle (FIFO). */
  kick(): void {
    setImmediate(() => {
      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const job = await this.claimNextPending();
        if (!job) break;
        await this.runJob(job);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[BroadcastJobs] processQueue fatal: ${message}`);
    } finally {
      this.running = false;
      // Un createJob peut être arrivé pendant le finally.
      const pending = await this.hasPending();
      if (pending) this.kick();
    }
  }

  private async hasPending(): Promise<boolean> {
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .select('id')
      .eq('status', 'pending')
      .limit(1);
    if (error) return false;
    return (data ?? []).length > 0;
  }

  private async claimNextPending(): Promise<BroadcastJobRow | null> {
    const { data: next, error: findErr } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .select(JOB_SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (findErr || !next) return null;

    const id = String((next as BroadcastJobRow).id);
    const now = new Date().toISOString();
    const { data: claimed, error: claimErr } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .update({
        status: 'running',
        started_at: now,
        error: null,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select(JOB_SELECT)
      .maybeSingle();

    if (claimErr || !claimed) return null;
    return claimed as BroadcastJobRow;
  }

  private async runJob(job: BroadcastJobRow): Promise<void> {
    const jobId = String(job.id);
    const recipients = parseBroadcastRecipients(job.phone_numbers);
    const config = parseMessageConfig(job.message_config);
    const personalized = config.personalized === true;
    let sent = Number(job.sent ?? 0);
    let failed = Number(job.failed ?? 0);
    let cursor = Number(job.cursor_index ?? 0);
    const total = Number(job.total ?? recipients.length);
    const delayMs = this.delayMs();

    this.logger.log(
      `[BroadcastJobs] start jobId=${jobId} total=${total} cursor=${cursor} personalized=${personalized} delayMs=${delayMs}`,
    );
    this.emitProgress({
      jobId,
      status: 'running',
      total,
      sent,
      failed,
    });

    let lastProgressAt = Date.now();
    let phonesSinceProgress = 0;

    for (let i = cursor; i < recipients.length; i += 1) {
      const cancelled = await this.isCancelled(jobId);
      if (cancelled) {
        const now = new Date().toISOString();
        const { data: finished } = await this.supabase
          .getClient()
          .from('whatsapp_broadcast_jobs')
          .update({
            status: 'cancelled',
            sent,
            failed,
            cursor_index: i,
            finished_at: now,
          })
          .eq('id', jobId)
          .select(JOB_SELECT)
          .maybeSingle();

        this.logger.log(
          `[BroadcastJobs] cancelled jobId=${jobId} sent=${sent} failed=${failed} at=${i}`,
        );
        this.emitDone(
          (finished as BroadcastJobRow) ?? {
            ...job,
            status: 'cancelled',
            sent,
            failed,
            finished_at: now,
          },
        );
        return;
      }

      const recipient = recipients[i]!;
      const phone = normalizePhoneNumber(recipient.phoneNumber);

      if (!phone) {
        failed += 1;
        await this.insertResult({
          jobId,
          phoneNumber: recipient.phoneNumber,
          success: false,
          error: 'Numéro WhatsApp invalide.',
        });
      } else {
        try {
          const sendArgs = personalized
            ? {
                phone,
                templateName: config.templateName,
                templateLanguage: config.templateLanguage,
                // Mode perso : variable1 du destinataire, fallback "Client".
                variable1: recipient.variable1?.trim() || DEFAULT_VARIABLE1,
                components: undefined,
              }
            : {
                phone,
                templateName: config.templateName,
                templateLanguage: config.templateLanguage,
                variable1: config.variable1,
                components: config.components,
              };

          const out =
            await this.whatsapp.sendBroadcastTemplateToPhone(sendArgs);
          sent += 1;
          await this.insertResult({
            jobId,
            phoneNumber: phone,
            success: true,
            conversationId: out.conversationId,
            messageId: out.messageId,
          });
        } catch (err: unknown) {
          const error = extractSendErrorMessage(err);
          failed += 1;
          this.logger.warn(
            `[BroadcastJobs] fail jobId=${jobId} phone=${phone}: ${error}`,
          );
          await this.insertResult({
            jobId,
            phoneNumber: phone,
            success: false,
            error,
          });
        }
      }

      cursor = i + 1;
      await this.updateProgress(jobId, { sent, failed, cursor_index: cursor });

      phonesSinceProgress += 1;
      const nowMs = Date.now();
      if (
        phonesSinceProgress >= PROGRESS_EVERY_N ||
        nowMs - lastProgressAt >= PROGRESS_MIN_MS
      ) {
        this.emitProgress({
          jobId,
          status: 'running',
          total,
          sent,
          failed,
        });
        phonesSinceProgress = 0;
        lastProgressAt = nowMs;
      }

      if (i < recipients.length - 1) {
        await this.delay(delayMs);
      }
    }

    const now = new Date().toISOString();
    const { data: doneRow, error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .update({
        status: 'completed',
        sent,
        failed,
        cursor_index: cursor,
        finished_at: now,
        error: null,
      })
      .eq('id', jobId)
      .select(JOB_SELECT)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `[BroadcastJobs] finalize failed jobId=${jobId}: ${error.message}`,
      );
    }

    this.logger.log(
      `[BroadcastJobs] completed jobId=${jobId} sent=${sent} failed=${failed} total=${total}`,
    );
    this.emitDone(
      (doneRow as BroadcastJobRow) ?? {
        ...job,
        status: 'completed',
        sent,
        failed,
        finished_at: now,
      },
    );
  }

  private async isCancelled(jobId: string): Promise<boolean> {
    const { data } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .select('status')
      .eq('id', jobId)
      .maybeSingle();
    return String((data as { status?: string } | null)?.status ?? '') === 'cancelled';
  }

  private async updateProgress(
    jobId: string,
    patch: { sent: number; failed: number; cursor_index: number },
  ): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .update(patch)
      .eq('id', jobId);
    if (error) {
      this.logger.warn(
        `[BroadcastJobs] progress update failed jobId=${jobId}: ${error.message}`,
      );
    }
  }

  private async insertResult(input: {
    jobId: string;
    phoneNumber: string;
    success: boolean;
    conversationId?: string;
    messageId?: string;
    error?: string;
  }): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_job_results')
      .upsert(
        {
          job_id: input.jobId,
          phone_number: input.phoneNumber,
          success: input.success,
          conversation_id: input.conversationId ?? null,
          message_id: input.messageId ?? null,
          error: input.error ?? null,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'job_id,phone_number' },
      );
    if (error) {
      this.logger.warn(
        `[BroadcastJobs] result insert failed jobId=${input.jobId} phone=${input.phoneNumber}: ${error.message}`,
      );
    }
  }

  private emitProgress(payload: {
    jobId: string;
    status: string;
    total: number;
    sent: number;
    failed: number;
  }): void {
    this.realtime.emitBroadcastProgress(payload);
  }

  private emitDone(row: BroadcastJobRow): void {
    this.realtime.emitBroadcastDone({
      jobId: String(row.id),
      status: String(row.status),
      total: Number(row.total ?? 0),
      sent: Number(row.sent ?? 0),
      failed: Number(row.failed ?? 0),
      error: row.error ? String(row.error) : null,
    });
  }

  private async loadJobOrThrow(jobId: string): Promise<BroadcastJobRow> {
    const id = jobId.trim();
    if (!id) {
      throw new NotFoundException({ message: 'Job introuvable.' });
    }
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .select(JOB_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Job introuvable.' });
    }
    return data as BroadcastJobRow;
  }

  private normalizeAndDedupePhones(raw: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
      const phone = normalizePhoneNumber(String(item ?? '').trim());
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      out.push(phone);
    }
    return out;
  }

  /** Déduplique par phone normalisé ; conserve le premier variable1. */
  private normalizeAndDedupeRecipients(
    raw: Array<{ phoneNumber: string; variable1?: string }>,
  ): BroadcastRecipientStored[] {
    const seen = new Set<string>();
    const out: BroadcastRecipientStored[] = [];
    for (const item of raw) {
      const phone = normalizePhoneNumber(String(item.phoneNumber ?? '').trim());
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const v1 = item.variable1?.trim() || undefined;
      out.push({
        phoneNumber: phone,
        ...(v1 ? { variable1: v1 } : {}),
      });
    }
    return out;
  }

  private delayMs(): number {
    const raw = this.config.get<string>('WHATSAPP_BROADCAST_DELAY_MS')?.trim();
    const n = raw ? Number(raw) : 300;
    if (!Number.isFinite(n) || n < 0) return 300;
    return Math.min(n, 10_000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
