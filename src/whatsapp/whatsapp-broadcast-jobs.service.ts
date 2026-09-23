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
import { EmailService } from '../email/email.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateBroadcastDto } from './dto/create-broadcast.dto';
import type {
  BroadcastChannels,
  BroadcastEmailConfig,
  BroadcastJobDetail,
  BroadcastJobListItem,
  BroadcastJobResultItem,
  BroadcastJobResultRow,
  BroadcastJobRow,
  BroadcastMessageConfig,
  BroadcastRecipientStored,
} from './types/broadcast-job.types';
import {
  buildRecipientKey,
  mapJobDetail,
  mapJobListItem,
  mapJobResult,
  parseBroadcastRecipients,
  parseChannels,
  parseEmailConfig,
  parseMessageConfig,
} from './types/broadcast-job.types';
import { normalizePhoneNumber } from './utils/phone';
import {
  extractSendErrorMessage,
  WhatsappService,
} from './whatsapp.service';

const JOB_SELECT =
  'id, created_by, status, message_config, phone_numbers, channels, email_config, total, sent, failed, email_sent, email_failed, cursor_index, error, created_at, started_at, finished_at';

const RESULT_SELECT =
  'id, job_id, phone_number, email, name, recipient_key, success, conversation_id, message_id, error, wa_success, wa_error, email_success, email_error, email_message_id, created_at';

const PHONE_WARN_THRESHOLD = 2000;
const PROGRESS_EVERY_N = 5;
const PROGRESS_MIN_MS = 1000;
const DEFAULT_VARIABLE1 = 'Client';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

@Injectable()
export class WhatsappBroadcastJobsService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappBroadcastJobsService.name);
  private running = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly whatsapp: WhatsappService,
    private readonly email: EmailService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Boot: running orphelins → failed. pending conservés + reclaim.
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
        this.logger.warn(
          `[BroadcastJobs] boot cleanup skipped: ${error.message}`,
        );
        return;
      }
      const n = (data ?? []).length;
      if (n > 0) {
        this.logger.warn(
          `[BroadcastJobs] boot cleanup: marked ${n} running job(s) as failed`,
        );
      }
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

    const channels: BroadcastChannels = {
      whatsapp: dto.channels?.whatsapp !== false,
      email: dto.channels?.email === true,
    };
    if (!channels.whatsapp && !channels.email) {
      throw new BadRequestException({
        message: 'Au moins un canal (whatsapp ou email) requis.',
      });
    }

    if (channels.whatsapp && !dto.templateName?.trim()) {
      throw new BadRequestException({ message: 'templateName requis' });
    }
    if (channels.email) {
      if (!dto.emailSubject?.trim() || !dto.emailHtml?.trim()) {
        throw new BadRequestException({
          message: 'emailSubject et emailHtml requis quand channels.email=true',
        });
      }
    }

    const useRecipients =
      Array.isArray(dto.recipients) && dto.recipients.length > 0;

    let stored: BroadcastRecipientStored[];
    let personalized = false;

    if (useRecipients) {
      personalized = true;
      stored = this.normalizeAndDedupeRecipients(dto.recipients!, channels);
    } else {
      const phones = this.normalizeAndDedupePhones(dto.phoneNumbers ?? []);
      stored = phones.map((phoneNumber) => ({ phoneNumber }));
    }

    if (stored.length === 0) {
      throw new BadRequestException({
        message:
          'Aucun destinataire valide pour les canaux sélectionnés (phone et/ou email).',
      });
    }

    if (stored.length > PHONE_WARN_THRESHOLD) {
      this.logger.warn(
        `[BroadcastJobs] large job total=${stored.length} by=${user.id}`,
      );
    }

    const messageConfig: BroadcastMessageConfig = channels.whatsapp
      ? {
          templateName: dto.templateName!.trim(),
          templateLanguage: dto.templateLanguage?.trim() || 'fr',
          personalized,
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
        }
      : { templateLanguage: 'fr', personalized: false };

    const emailConfig: BroadcastEmailConfig | null = channels.email
      ? {
          subject: dto.emailSubject!.trim(),
          html: dto.emailHtml!.trim(),
        }
      : null;

    // phone_numbers jsonb : objets enrichis (ou string[] legacy via forme A → objets phone only)
    const phoneNumbersPayload = personalized
      ? stored
      : stored.map((r) => r.phoneNumber!).filter(Boolean);

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .insert({
        created_by: user.id,
        status: 'pending',
        message_config: messageConfig,
        phone_numbers: personalized ? stored : phoneNumbersPayload,
        channels,
        email_config: emailConfig,
        total: stored.length,
        sent: 0,
        failed: 0,
        email_sent: 0,
        email_failed: 0,
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
      `[BroadcastJobs] created jobId=${jobId} total=${stored.length} wa=${channels.whatsapp} email=${channels.email} by=${user.id}`,
    );
    this.kick();

    return { jobId, total: stored.length, status: 'pending' };
  }

  async listJobs(user: AppUser): Promise<{ items: BroadcastJobListItem[] }> {
    assertCanAccessWhatsapp(user);
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_jobs')
      .select(JOB_SELECT)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new ConflictException({ message: error.message });
    return {
      items: ((data ?? []) as BroadcastJobRow[]).map(mapJobListItem),
    };
  }

  async getJob(jobId: string, user: AppUser): Promise<BroadcastJobDetail> {
    assertCanAccessWhatsapp(user);
    return mapJobDetail(await this.loadJobOrThrow(jobId));
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

    if (error) throw new ConflictException({ message: error.message });
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

    if (error) throw new ConflictException({ message: error.message });
    if (!data) {
      throw new ConflictException({
        message: 'Impossible d’annuler ce job (status changé).',
      });
    }

    const updated = data as BroadcastJobRow;
    this.logger.log(`[BroadcastJobs] cancel requested jobId=${jobId}`);
    if (String(updated.status) === 'cancelled' && updated.finished_at) {
      this.emitDone(updated);
    }
    return { ok: true, id: jobId, status: String(updated.status) };
  }

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
      if (await this.hasPending()) this.kick();
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
    const channels = parseChannels(job.channels);
    const emailConfig = parseEmailConfig(job.email_config);
    const personalized = config.personalized === true;

    let waSent = Number(job.sent ?? 0);
    let waFailed = Number(job.failed ?? 0);
    let emailSent = Number(job.email_sent ?? 0);
    let emailFailed = Number(job.email_failed ?? 0);
    let cursor = Number(job.cursor_index ?? 0);
    const total = Number(job.total ?? recipients.length);
    const delayMs = this.delayMs();

    this.logger.log(
      `[BroadcastJobs] start jobId=${jobId} total=${total} wa=${channels.whatsapp} email=${channels.email}`,
    );
    this.emitProgress({
      jobId,
      status: 'running',
      total,
      waSent,
      waFailed,
      emailSent,
      emailFailed,
    });

    let lastProgressAt = Date.now();
    let sinceProgress = 0;

    for (let i = cursor; i < recipients.length; i += 1) {
      if (await this.isCancelled(jobId)) {
        const now = new Date().toISOString();
        const { data: finished } = await this.supabase
          .getClient()
          .from('whatsapp_broadcast_jobs')
          .update({
            status: 'cancelled',
            sent: waSent,
            failed: waFailed,
            email_sent: emailSent,
            email_failed: emailFailed,
            cursor_index: i,
            finished_at: now,
          })
          .eq('id', jobId)
          .select(JOB_SELECT)
          .maybeSingle();

        this.emitDone(
          (finished as BroadcastJobRow) ?? {
            ...job,
            status: 'cancelled',
            sent: waSent,
            failed: waFailed,
            email_sent: emailSent,
            email_failed: emailFailed,
            finished_at: now,
          },
        );
        return;
      }

      const recipient = recipients[i]!;
      const phone = recipient.phoneNumber
        ? normalizePhoneNumber(recipient.phoneNumber)
        : '';
      const email = (recipient.email ?? '').trim().toLowerCase();
      const displayName =
        recipient.name?.trim() ||
        recipient.variable1?.trim() ||
        DEFAULT_VARIABLE1;

      let waSuccess: boolean | null = null;
      let waError: string | null = null;
      let conversationId: string | null = null;
      let messageId: string | null = null;
      let emailSuccess: boolean | null = null;
      let emailError: string | null = null;
      let emailMessageId: string | null = null;

      // ── WhatsApp ──
      if (channels.whatsapp) {
        if (!phone) {
          waSuccess = false;
          waError = 'Numéro WhatsApp manquant ou invalide.';
          waFailed += 1;
        } else {
          try {
            const variable1 = personalized
              ? recipient.variable1?.trim() ||
                recipient.name?.trim() ||
                DEFAULT_VARIABLE1
              : config.variable1;
            const out = await this.whatsapp.sendBroadcastTemplateToPhone({
              phone,
              templateName: config.templateName || '',
              templateLanguage: config.templateLanguage,
              variable1: personalized ? variable1 : config.variable1,
              components: personalized ? undefined : config.components,
            });
            waSuccess = true;
            conversationId = out.conversationId;
            messageId = out.messageId;
            waSent += 1;
          } catch (err: unknown) {
            waSuccess = false;
            waError = extractSendErrorMessage(err);
            waFailed += 1;
            this.logger.warn(
              `[BroadcastJobs] WA fail jobId=${jobId} phone=${phone}: ${waError}`,
            );
          }
        }
      }

      // ── Email ──
      if (channels.email && emailConfig) {
        if (!email || !isValidEmail(email)) {
          emailSuccess = false;
          emailError = 'email invalide ou manquant.';
          emailFailed += 1;
        } else {
          try {
            const out = await this.email.sendOneBroadcastEmail({
              email,
              name: displayName,
              subject: emailConfig.subject,
              html: emailConfig.html,
            });
            emailSuccess = true;
            emailMessageId = out.messageId || null;
            emailSent += 1;
          } catch (err: unknown) {
            emailSuccess = false;
            emailError = extractSendErrorMessage(err);
            emailFailed += 1;
            this.logger.warn(
              `[BroadcastJobs] email fail jobId=${jobId} email=${email}: ${emailError}`,
            );
          }
        }
      }

      await this.upsertResult({
        jobId,
        phoneNumber: phone || null,
        email: email || null,
        name: displayName,
        waSuccess,
        waError,
        conversationId,
        messageId,
        emailSuccess,
        emailError,
        emailMessageId,
      });

      cursor = i + 1;
      await this.updateProgress(jobId, {
        sent: waSent,
        failed: waFailed,
        email_sent: emailSent,
        email_failed: emailFailed,
        cursor_index: cursor,
      });

      sinceProgress += 1;
      const nowMs = Date.now();
      if (
        sinceProgress >= PROGRESS_EVERY_N ||
        nowMs - lastProgressAt >= PROGRESS_MIN_MS
      ) {
        this.emitProgress({
          jobId,
          status: 'running',
          total,
          waSent,
          waFailed,
          emailSent,
          emailFailed,
        });
        sinceProgress = 0;
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
        sent: waSent,
        failed: waFailed,
        email_sent: emailSent,
        email_failed: emailFailed,
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
      `[BroadcastJobs] completed jobId=${jobId} wa=${waSent}/${waFailed} email=${emailSent}/${emailFailed}`,
    );
    this.emitDone(
      (doneRow as BroadcastJobRow) ?? {
        ...job,
        status: 'completed',
        sent: waSent,
        failed: waFailed,
        email_sent: emailSent,
        email_failed: emailFailed,
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
    return (
      String((data as { status?: string } | null)?.status ?? '') === 'cancelled'
    );
  }

  private async updateProgress(
    jobId: string,
    patch: {
      sent: number;
      failed: number;
      email_sent: number;
      email_failed: number;
      cursor_index: number;
    },
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

  private async upsertResult(input: {
    jobId: string;
    phoneNumber: string | null;
    email: string | null;
    name: string;
    waSuccess: boolean | null;
    waError: string | null;
    conversationId: string | null;
    messageId: string | null;
    emailSuccess: boolean | null;
    emailError: string | null;
    emailMessageId: string | null;
  }): Promise<void> {
    const recipientKey = buildRecipientKey({
      phoneNumber: input.phoneNumber,
      email: input.email,
    });
    const legacySuccess = input.waSuccess === true;
    const legacyError = input.waError;

    const { error } = await this.supabase
      .getClient()
      .from('whatsapp_broadcast_job_results')
      .upsert(
        {
          job_id: input.jobId,
          recipient_key: recipientKey,
          phone_number: input.phoneNumber,
          email: input.email,
          name: input.name,
          success: legacySuccess,
          error: legacyError,
          conversation_id: input.conversationId,
          message_id: input.messageId,
          wa_success: input.waSuccess,
          wa_error: input.waError,
          email_success: input.emailSuccess,
          email_error: input.emailError,
          email_message_id: input.emailMessageId,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'job_id,recipient_key' },
      );

    if (error) {
      this.logger.warn(
        `[BroadcastJobs] result upsert failed jobId=${input.jobId} key=${recipientKey}: ${error.message}`,
      );
    }
  }

  private emitProgress(payload: {
    jobId: string;
    status: string;
    total: number;
    waSent: number;
    waFailed: number;
    emailSent: number;
    emailFailed: number;
  }): void {
    this.realtime.emitBroadcastProgress(payload);
  }

  private emitDone(row: BroadcastJobRow): void {
    this.realtime.emitBroadcastDone({
      jobId: String(row.id),
      status: String(row.status),
      total: Number(row.total ?? 0),
      waSent: Number(row.sent ?? 0),
      waFailed: Number(row.failed ?? 0),
      emailSent: Number(row.email_sent ?? 0),
      emailFailed: Number(row.email_failed ?? 0),
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

    if (error) throw new ConflictException({ message: error.message });
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

  /**
   * Déduplique : clé = phone|email. Garde le premier.
   * Filtre selon canaux (doit avoir au moins un contact utilisable).
   */
  private normalizeAndDedupeRecipients(
    raw: Array<{
      phoneNumber?: string;
      email?: string;
      name?: string;
      variable1?: string;
    }>,
    channels: BroadcastChannels,
  ): BroadcastRecipientStored[] {
    const seen = new Set<string>();
    const out: BroadcastRecipientStored[] = [];

    for (const item of raw) {
      const phone = normalizePhoneNumber(
        String(item.phoneNumber ?? '').trim(),
      );
      const email = String(item.email ?? '')
        .trim()
        .toLowerCase();
      const validEmail = email && isValidEmail(email) ? email : '';

      const usableWa = channels.whatsapp && Boolean(phone);
      const usableEmail = channels.email && Boolean(validEmail);
      if (!usableWa && !usableEmail) continue;

      const key = buildRecipientKey({
        phoneNumber: phone || null,
        email: validEmail || null,
      });
      if (seen.has(key)) continue;
      seen.add(key);

      const name = item.name?.trim() || undefined;
      const variable1 = item.variable1?.trim() || undefined;
      out.push({
        ...(phone ? { phoneNumber: phone } : {}),
        ...(validEmail ? { email: validEmail } : {}),
        ...(name ? { name } : {}),
        ...(variable1 ? { variable1 } : {}),
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
