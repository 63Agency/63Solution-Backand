import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

export type EmailTrackingChannel = 'bulk' | 'mailbox' | 'transactional';

export type CreateTrackingInput = {
  email: string;
  channel: EmailTrackingChannel;
  subject?: string | null;
  campaign?: string | null;
  sentBy?: string | null;
};

/** PNG 1×1 transparent. */
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger(EmailTrackingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  transparentPng(): Buffer {
    return TRANSPARENT_PNG;
  }

  private publicApiUrl(): string {
    const raw =
      this.config.get<string>('PUBLIC_API_URL')?.trim() ||
      this.config.get<string>('API_PUBLIC_URL')?.trim() ||
      'https://api.63agency.com';
    return raw.replace(/\/+$/, '');
  }

  pixelUrl(trackingId: string): string {
    return `${this.publicApiUrl()}/email/pixel/${trackingId}.png`;
  }

  injectPixel(html: string, trackingId: string): string {
    const src = this.pixelUrl(trackingId).replace(/"/g, '&quot;');
    const img = `<img src="${src}" width="1" height="1" style="display:none" alt="" />`;
    return `${html}\n${img}`;
  }

  /**
   * Si html vide : enveloppe text en HTML minimal + pixel.
   * Si html présent : pixel en fin de html.
   */
  ensureHtmlWithPixel(
    html: string | null | undefined,
    text: string | null | undefined,
    trackingId: string,
  ): string {
    const rawHtml = (html ?? '').trim();
    const rawText = (text ?? '').trim();
    const base =
      rawHtml ||
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;"><p>${escapeHtml(rawText).replace(/\n/g, '<br/>')}</p></div>`;
    return this.injectPixel(base, trackingId);
  }

  /**
   * Insert tracking row. Fail-open : retourne null si erreur (envoi mail non bloqué).
   * UUID généré côté app (pas de dépendance à RETURNING / .single()).
   */
  async createTracking(input: CreateTrackingInput): Promise<string | null> {
    const email = String(input.email ?? '')
      .trim()
      .toLowerCase();
    const channel = input.channel;
    if (!email) {
      this.logger.warn(
        `[EmailTracking] create skipped channel=${channel}: email vide`,
      );
      return null;
    }

    const trackingId = randomUUID();
    try {
      const { error } = await this.supabase.getClient().from('email_opens').insert({
        tracking_id: trackingId,
        email,
        channel,
        subject: cleanNull(input.subject),
        campaign: cleanNull(input.campaign),
        sent_by: cleanNull(input.sentBy),
        sent_at: new Date().toISOString(),
        open_count: 0,
      });

      if (error) {
        this.logger.warn(
          `[EmailTracking] create failed channel=${channel} email=${email} ` +
            `code=${error.code ?? '-'} details=${error.details ?? '-'} ` +
            `message=${error.message}`,
        );
        return null;
      }

      this.logger.log(
        `[EmailTracking] created channel=${channel} id=${trackingId} email=${email}`,
      );
      return trackingId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[EmailTracking] create error channel=${channel} email=${email}: ${msg}`,
      );
      return null;
    }
  }

  /** Best-effort : jamais throw. */
  async registerOpen(
    trackingId: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const id = String(trackingId ?? '').trim();
    if (!id) return;

    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('email_opens')
        .select('tracking_id, opened_at, open_count')
        .eq('tracking_id', id)
        .maybeSingle();

      if (error || !data) {
        if (error) {
          this.logger.warn(
            `[EmailTracking] registerOpen lookup failed id=${id}: ${error.message}`,
          );
        }
        return;
      }

      const row = data as {
        tracking_id: string;
        opened_at: string | null;
        open_count: number;
      };
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        open_count: (Number(row.open_count) || 0) + 1,
        last_ip: ip ? ip.slice(0, 200) : null,
        last_user_agent: userAgent ? userAgent.slice(0, 500) : null,
      };
      if (!row.opened_at) {
        patch.opened_at = now;
      }

      const { error: updErr } = await this.supabase
        .getClient()
        .from('email_opens')
        .update(patch)
        .eq('tracking_id', id);

      if (updErr) {
        this.logger.warn(
          `[EmailTracking] registerOpen update failed id=${id}: ${updErr.message}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[EmailTracking] registerOpen error id=${id}: ${msg}`);
    }
  }
}

function cleanNull(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
