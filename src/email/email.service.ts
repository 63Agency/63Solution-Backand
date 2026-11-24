import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppUser } from '../auth/types/app-user';
import {
  assertCanBroadcastEmail,
  assertFullAdmin,
} from '../common/utils/access';
import { canAccessWhatsapp } from '../common/utils/roles';
import { SupabaseService } from '../supabase/supabase.service';
import { normalizeMessageId } from './brevo-webhook.service';
import { BulkMailerService } from './bulk-mailer.service';
import type { BroadcastEmailDto } from './dto/broadcast-email.dto';
import { EmailTrackingService } from './email-tracking.service';
import type { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto';
import {
  type EmailTemplateMapping,
  type EmailTemplateRow,
  mapEmailTemplateRow,
} from './types/email-template.types';
import { UnsubscribeService } from './unsubscribe.service';

export type EmailRecipient = {
  email: string;
  name: string;
};

export type BroadcastEmailResultItem = {
  email: string;
  name: string;
  success: boolean;
  messageId?: string;
  error?: string;
};

export type EmailEventItem = {
  id: number;
  messageId: string | null;
  email: string;
  event: string;
  subject: string | null;
  tag: string | null;
  eventAt: string | null;
  createdAt: string;
};

export type EmailOpenItem = {
  trackingId: string;
  email: string;
  channel: string;
  subject: string | null;
  campaign: string | null;
  sentBy: string | null;
  sentAt: string;
  openedAt: string | null;
  openCount: number;
  status: 'sent' | 'opened';
};

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_DELAY_MS = 1000;

const EMAIL_TEMPLATE_SELECT =
  'id, wa_template_name, subject, html_body, updated_at';

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
    private readonly unsubscribe: UnsubscribeService,
    private readonly tracking: EmailTrackingService,
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

  /** Persiste un envoi bulk pour corrélation Brevo. Ne throw jamais. */
  private async recordEmailSend(input: {
    messageId: string | null | undefined;
    email: string;
    subject: string;
    campaign?: string | null;
  }): Promise<void> {
    try {
      const email = clean(input.email).toLowerCase();
      if (!email) return;
      const { error } = await this.supabase.getClient().from('email_sends').insert({
        message_id: normalizeMessageId(input.messageId),
        email,
        subject: clean(input.subject) || null,
        campaign: clean(input.campaign) || null,
        sent_at: new Date().toISOString(),
      });
      if (error) {
        this.logger.warn(
          `[BulkEmail] email_sends insert failed email=${email}: ${error.message}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[BulkEmail] email_sends insert error: ${msg}`);
    }
  }

  /**
   * Derniers événements Brevo pour un email (statut destinataire).
   * Auth : assertCanBroadcastEmail.
   */
  async listEvents(
    user: AppUser,
    filters: { email?: string; limit?: number },
  ): Promise<EmailEventItem[]> {
    assertCanBroadcastEmail(user);

    const email = clean(filters.email).toLowerCase();
    if (!email || !isValidEmail(email)) {
      throw new ConflictException({ message: 'email requis (valide)' });
    }

    const limitRaw = filters.limit ?? 50;
    const limit = Math.min(
      Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50, 1),
      200,
    );

    const { data, error } = await this.supabase
      .getClient()
      .from('email_events')
      .select(
        'id, message_id, email, event, subject, tag, event_at, created_at',
      )
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      messageId: row.message_id ? String(row.message_id) : null,
      email: String(row.email),
      event: String(row.event),
      subject: row.subject != null ? String(row.subject) : null,
      tag: row.tag != null ? String(row.tag) : null,
      eventAt: row.event_at ? String(row.event_at) : null,
      createdAt: String(row.created_at ?? ''),
    }));
  }

  /**
   * Statut ouvertures pixel (œil gris/vert).
   * Broadcast rights → tout ; sinon → sent_by = user.id uniquement.
   */
  async listOpens(
    user: AppUser,
    filters: { email?: string; limit?: number },
  ): Promise<EmailOpenItem[]> {
    const email = clean(filters.email).toLowerCase();
    if (!email || !isValidEmail(email)) {
      throw new ConflictException({ message: 'email requis (valide)' });
    }

    const limitRaw = filters.limit ?? 50;
    const limit = Math.min(
      Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50, 1),
      200,
    );

    let query = this.supabase
      .getClient()
      .from('email_opens')
      .select(
        'tracking_id, email, channel, subject, campaign, sent_by, sent_at, opened_at, open_count',
      )
      .eq('email', email)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (!canAccessWhatsapp(user.role)) {
      query = query.eq('sent_by', user.id);
    }

    const { data, error } = await query;
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const openedAt = row.opened_at ? String(row.opened_at) : null;
      const openCount = Number(row.open_count) || 0;
      return {
        trackingId: String(row.tracking_id),
        email: String(row.email),
        channel: String(row.channel),
        subject: row.subject != null ? String(row.subject) : null,
        campaign: row.campaign != null ? String(row.campaign) : null,
        sentBy: row.sent_by != null ? String(row.sent_by) : null,
        sentAt: String(row.sent_at ?? ''),
        openedAt,
        openCount,
        status: openedAt || openCount > 0 ? ('opened' as const) : ('sent' as const),
      };
    });
  }

  // ─── WA → email template mappings (composer pre-fill only) ───

  async listTemplates(user: AppUser): Promise<EmailTemplateMapping[]> {
    assertCanBroadcastEmail(user);

    const { data, error } = await this.supabase
      .getClient()
      .from('email_templates')
      .select(EMAIL_TEMPLATE_SELECT)
      .order('wa_template_name', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const items = ((data ?? []) as EmailTemplateRow[]).map(mapEmailTemplateRow);
    this.logger.log(`[EmailTemplates] list count=${items.length}`);
    return items;
  }

  async getTemplateByWaName(
    user: AppUser,
    waTemplateName: string,
  ): Promise<EmailTemplateMapping> {
    assertCanBroadcastEmail(user);

    const name = clean(waTemplateName);
    if (!name) {
      throw new NotFoundException({ message: 'Template email introuvable.' });
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('email_templates')
      .select(EMAIL_TEMPLATE_SELECT)
      .eq('wa_template_name', name)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({
        message: `Aucun mapping email pour le template WhatsApp « ${name} ».`,
      });
    }

    return mapEmailTemplateRow(data as EmailTemplateRow);
  }

  async upsertTemplate(
    user: AppUser,
    waTemplateName: string,
    dto: UpsertEmailTemplateDto,
  ): Promise<EmailTemplateMapping> {
    assertFullAdmin(user);

    const name = clean(waTemplateName);
    const subject = clean(dto.subject);
    const htmlBody = dto.html_body.trim();
    if (!name) {
      throw new ConflictException({ message: 'waTemplateName requis.' });
    }
    if (!subject || !htmlBody) {
      throw new ConflictException({
        message: 'subject et html_body sont requis.',
      });
    }

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .getClient()
      .from('email_templates')
      .upsert(
        {
          wa_template_name: name,
          subject,
          html_body: htmlBody,
          updated_at: now,
        },
        { onConflict: 'wa_template_name' },
      )
      .select(EMAIL_TEMPLATE_SELECT)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Upsert template email impossible.',
      });
    }

    this.logger.log(`[EmailTemplates] upsert wa=${name}`);
    return mapEmailTemplateRow(data as EmailTemplateRow);
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
   * Envoi unitaire bulk (réutilisé par le worker broadcast multi-canal WA+email).
   * Remplace {{name}} / {{1}}. Signature + pied désabo dans BulkMailerService.
   */
  async sendOneBroadcastEmail(input: {
    email: string;
    name?: string | null;
    subject: string;
    html: string;
    campaign?: string | null;
  }): Promise<{ messageId: string }> {
    const email = clean(input.email).toLowerCase();
    if (!email || !isValidEmail(email)) {
      throw new ConflictException({ message: 'email invalide' });
    }

    const allowed = await this.unsubscribe.filterUnsubscribed([email]);
    if (allowed.length === 0) {
      throw new ConflictException({ message: 'destinataire désabonné' });
    }

    const displayName = clean(input.name) || 'Client';
    const subjectTpl = clean(input.subject);
    const htmlTpl = input.html.trim();
    if (!subjectTpl || !htmlTpl) {
      throw new ConflictException({
        message: 'subject et html sont requis.',
      });
    }

    const subject = applyNamePlaceholder(subjectTpl, displayName);
    const html = applyNamePlaceholder(htmlTpl, displayName);
    const text = htmlToText(html);
    const unsubscribeUrl = this.unsubscribe.buildUnsubscribeUrl(email);
    const trackingId = await this.tracking.createTracking({
      email,
      channel: 'bulk',
      subject,
      campaign: input.campaign ?? null,
      sentBy: null,
    });
    if (!trackingId) {
      this.logger.warn(
        `[BulkEmail] email_opens insert failed (fail-open) channel=bulk email=${email} — envoi sans pixel`,
      );
    }

    const mailResult = await this.bulkMailer.sendMail({
      to: email,
      subject,
      html,
      text,
      headers: this.unsubscribe.listUnsubscribeHeaders(unsubscribeUrl),
      unsubscribeUrl,
      trackingId,
    });
    const messageId = mailResult.messageId || '';
    await this.recordEmailSend({
      messageId,
      email,
      subject,
      campaign: input.campaign,
    });
    return { messageId };
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

    // Deduplicate by email (keep first name). Invalid emails → report + skip (do not abort).
    const byEmail = new Map<string, EmailRecipient>();
    const results: BroadcastEmailResultItem[] = [];
    let sent = 0;
    let failed = 0;

    for (const r of dto.recipients) {
      const email = clean(r.email).toLowerCase();
      const displayName = clean(r.name) || 'Client';
      if (!email || !isValidEmail(email)) {
        results.push({
          email: clean(r.email) || '(vide)',
          name: displayName,
          success: false,
          error: 'email invalide — ignoré',
        });
        failed += 1;
        continue;
      }
      if (byEmail.has(email)) continue;
      byEmail.set(email, { email, name: displayName });
    }

    const recipients = [...byEmail.values()];
    if (recipients.length === 0) {
      throw new ConflictException({
        message: 'Aucun destinataire email valide.',
      });
    }

    // Fail-CLOSED si la table email_unsubscribes est inaccessible.
    const allowedEmails = new Set(
      await this.unsubscribe.filterUnsubscribed(
        recipients.map((r) => r.email),
      ),
    );
    const toSend: EmailRecipient[] = [];
    for (const r of recipients) {
      if (!allowedEmails.has(r.email)) {
        results.push({
          email: r.email,
          name: r.name,
          success: false,
          error: 'désabonné — ignoré',
        });
        failed += 1;
        continue;
      }
      toSend.push(r);
    }

    const batchSize = this.batchSize();
    const delayMs = this.batchDelayMs();
    let batchIndex = 0;

    this.logger.log(
      `[BulkEmail] start template=${templateLabel} total=${toSend.length} skippedUnsub=${recipients.length - toSend.length} batchSize=${batchSize} delayMs=${delayMs}`,
    );

    for (let i = 0; i < toSend.length; i += batchSize) {
      batchIndex += 1;
      const batch = toSend.slice(i, i + batchSize);
      let batchSent = 0;
      let batchFailed = 0;

      for (const recipient of batch) {
        const displayName = recipient.name || 'Client';
        const subject = applyNamePlaceholder(subjectTpl, displayName);
        const html = applyNamePlaceholder(htmlTpl, displayName);
        const text = htmlToText(html);
        const unsubscribeUrl = this.unsubscribe.buildUnsubscribeUrl(
          recipient.email,
        );
        const campaign =
          templateLabel === '-' ? null : templateLabel;
        const trackingId = await this.tracking.createTracking({
          email: recipient.email,
          channel: 'bulk',
          subject,
          campaign,
          sentBy: user.id,
        });
        if (!trackingId) {
          this.logger.warn(
            `[BulkEmail] email_opens insert failed (fail-open) channel=bulk email=${recipient.email} — envoi sans pixel`,
          );
        }

        try {
          // Signature → désabo → pixel (BulkMailerService)
          const mailResult = await this.bulkMailer.sendMail({
            to: recipient.email,
            subject,
            html,
            text,
            headers:
              this.unsubscribe.listUnsubscribeHeaders(unsubscribeUrl),
            unsubscribeUrl,
            trackingId,
          });
          this.logger.log(
            `[BulkEmail] sent email=${recipient.email} messageId=${mailResult.messageId || '-'}`,
          );
          await this.recordEmailSend({
            messageId: mailResult.messageId,
            email: recipient.email,
            subject,
            campaign,
          });
          results.push({
            email: recipient.email,
            name: displayName,
            success: true,
            messageId: mailResult.messageId || undefined,
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
        `[BulkEmail] batch=${batchIndex} sent=${batchSent} failed=${batchFailed} total=${toSend.length}`,
      );

      if (i + batchSize < toSend.length && delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    this.logger.log(
      `[BulkEmail] complete template=${templateLabel} sent=${sent} failed=${failed} total=${sent + failed}`,
    );

    return {
      sent,
      failed,
      total: sent + failed,
      results,
    };
  }
}
