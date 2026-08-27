import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppUser } from '../auth/types/app-user';
import { assertCanBroadcastEmail } from '../common/utils/access';
import { SupabaseService } from '../supabase/supabase.service';
import { BulkMailerService } from './bulk-mailer.service';
import type { BroadcastEmailDto } from './dto/broadcast-email.dto';

export type EmailRecipient = {
  email: string;
  name: string;
};

export type BroadcastEmailResultItem = {
  email: string;
  name: string;
  success: boolean;
  error?: string;
};

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_DELAY_MS = 1000;

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Remplace {{name}} (et {{1}} legacy WA) par destinataire.
 */
function applyNamePlaceholder(template: string, name: string): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*1\s*\}\}/g, name);
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof HttpException) {
    const r = err.getResponse();
    if (typeof r === 'string' && r.trim()) return r.trim();
    if (r && typeof r === 'object') {
      const m = (r as Record<string, unknown>).message;
      if (typeof m === 'string' && m.trim()) return m.trim();
      if (Array.isArray(m) && typeof m[0] === 'string') return m[0].trim();
    }
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return "Échec d'envoi de l'email.";
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly supabase: SupabaseService,
    /** Bulk only — never MailerService / SMTP_* (meetings). */
    private readonly bulkMailer: BulkMailerService,
    private readonly config: ConfigService,
  ) {}

  private batchSize(): number {
    const raw = this.config.get<string>('EMAIL_BATCH_SIZE')?.trim();
    const n = raw ? Number(raw) : DEFAULT_BATCH_SIZE;
    if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_SIZE;
    return Math.min(Math.floor(n), 100);
  }

  private batchDelayMs(): number {
    const raw = this.config.get<string>('EMAIL_BATCH_DELAY_MS')?.trim();
    const n = raw ? Number(raw) : DEFAULT_BATCH_DELAY_MS;
    if (!Number.isFinite(n) || n < 0) return DEFAULT_BATCH_DELAY_MS;
    return Math.min(Math.floor(n), 60_000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Leads ClickUp avec email non vide.
   * Filtres optionnels list_id + status — même logique que le module leads.
   * Auth : admin + admin_whatsapp (comme WhatsApp broadcast).
   */
  async listRecipients(
    user: AppUser,
    filters: { listId?: string; status?: string } = {},
  ): Promise<EmailRecipient[]> {
    assertCanBroadcastEmail(user);

    const listId = filters.listId?.trim();
    const status = filters.status?.trim();

    let query = this.supabase
      .getClient()
      .from('clickup_leads')
      .select('name, email')
      .not('email', 'is', null)
      .order('updated_at', { ascending: false });

    if (listId) query = query.eq('list_id', listId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const byEmail = new Map<string, EmailRecipient>();
    for (const row of data ?? []) {
      const email = clean(row.email as string | null).toLowerCase();
      if (!email || !isValidEmail(email)) continue;
      if (byEmail.has(email)) continue;
      byEmail.set(email, {
        email,
        name: clean(row.name as string | null),
      });
    }

    const items = [...byEmail.values()].sort((a, b) =>
      a.email.localeCompare(b.email, 'fr'),
    );

    this.logger.log(
      `[BulkEmail] recipients listId=${listId || '-'} status=${status || '-'} count=${items.length}`,
    );

    return items;
  }

  /**
   * Envoi bulk one-by-one via BulkMailerService (BULK_SMTP_*).
   * Remplace {{name}} (et {{1}}) dans subject + html par destinataire.
   * Auth : admin + admin_whatsapp.
   */
  async broadcast(
    user: AppUser,
    dto: BroadcastEmailDto,
  ): Promise<{
    sent: number;
    failed: number;
    total: number;
    results: BroadcastEmailResultItem[];
  }> {
    assertCanBroadcastEmail(user);

    const subjectTpl = clean(dto.subject);
    const htmlTpl = dto.html.trim();
    if (!subjectTpl || !htmlTpl) {
      throw new ConflictException({
        message: 'subject et html sont requis.',
      });
    }

    const templateLabel = clean(dto.templateName) || clean(dto.templateId) || '-';

    // Deduplicate by email (keep first name).
    const byEmail = new Map<string, EmailRecipient>();
    for (const r of dto.recipients) {
      const email = clean(r.email).toLowerCase();
      if (!email || !isValidEmail(email)) continue;
      if (byEmail.has(email)) continue;
      byEmail.set(email, {
        email,
        name: clean(r.name) || 'Client',
      });
    }

    const recipients = [...byEmail.values()];
    if (recipients.length === 0) {
      throw new ConflictException({
        message: 'Aucun destinataire email valide.',
      });
    }

    const batchSize = this.batchSize();
    const delayMs = this.batchDelayMs();
    const results: BroadcastEmailResultItem[] = [];
    let sent = 0;
    let failed = 0;
    let batchIndex = 0;

    this.logger.log(
      `[BulkEmail] start template=${templateLabel} total=${recipients.length} batchSize=${batchSize} delayMs=${delayMs}`,
    );

    for (let i = 0; i < recipients.length; i += batchSize) {
      batchIndex += 1;
      const batch = recipients.slice(i, i + batchSize);
      let batchSent = 0;
      let batchFailed = 0;

      for (const recipient of batch) {
        const displayName = recipient.name || 'Client';
        const subject = applyNamePlaceholder(subjectTpl, displayName);
        const html = applyNamePlaceholder(htmlTpl, displayName);
        const text = htmlToText(html);

        try {
          await this.bulkMailer.sendMail({
            to: recipient.email,
            subject,
            html,
            text,
          });
          results.push({
            email: recipient.email,
            name: displayName,
            success: true,
          });
          sent += 1;
          batchSent += 1;
        } catch (err: unknown) {
          const error = extractErrorMessage(err);
          this.logger.warn(
            `[BulkEmail] failed email=${recipient.email}: ${error}`,
          );
          results.push({
            email: recipient.email,
            name: displayName,
            success: false,
            error,
          });
          failed += 1;
          batchFailed += 1;
        }
      }

      this.logger.log(
        `[BulkEmail] batch=${batchIndex} sent=${batchSent} failed=${batchFailed} total=${recipients.length}`,
      );

      if (i + batchSize < recipients.length && delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    this.logger.log(
      `[BulkEmail] complete template=${templateLabel} sent=${sent} failed=${failed} total=${recipients.length}`,
    );

    return {
      sent,
      failed,
      total: recipients.length,
      results,
    };
  }
}
