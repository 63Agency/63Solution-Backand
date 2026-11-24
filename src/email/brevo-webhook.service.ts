import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { UnsubscribeService } from './unsubscribe.service';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/** Message-ID sans < > ni espaces. */
export function normalizeMessageId(raw: unknown): string | null {
  const s = clean(raw).replace(/^<|>$/g, '').trim();
  return s || null;
}

function parseEventAt(payload: Record<string, unknown>): string | null {
  const dateStr = clean(payload.date);
  if (dateStr) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const ts = payload.ts_epoch ?? payload.ts;
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    // Brevo sometimes sends seconds, sometimes ms
    const ms = ts > 1e12 ? ts : ts * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof ts === 'string' && ts.trim()) {
    const n = Number(ts);
    if (Number.isFinite(n)) {
      const ms = n > 1e12 ? n : n * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

function asPayloadList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
  }
  if (body && typeof body === 'object') {
    return [body as Record<string, unknown>];
  }
  return [];
}

@Injectable()
export class BrevoWebhookService {
  private readonly logger = new Logger(BrevoWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly unsubscribe: UnsubscribeService,
  ) {}

  assertWebhookToken(token: string | undefined): void {
    const expected = this.config.get<string>('BREVO_WEBHOOK_SECRET')?.trim();
    if (!expected) {
      this.logger.error('[BrevoWebhook] BREVO_WEBHOOK_SECRET manquant');
      throw new UnauthorizedException({
        message: 'Webhook Brevo non configuré.',
      });
    }
    if (!token || token !== expected) {
      throw new UnauthorizedException({
        message: 'token webhook invalide',
      });
    }
  }

  async handleWebhook(body: unknown): Promise<{ ok: true; processed: number }> {
    const items = asPayloadList(body);
    let processed = 0;

    for (const payload of items) {
      try {
        await this.persistEvent(payload);
        processed += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[BrevoWebhook] event skip: ${msg}`);
      }
    }

    this.logger.log(
      `[BrevoWebhook] processed=${processed} received=${items.length}`,
    );
    return { ok: true, processed };
  }

  private async persistEvent(payload: Record<string, unknown>): Promise<void> {
    const event = clean(payload.event).toLowerCase();
    const email = clean(payload.email).toLowerCase();
    if (!event || !email) {
      throw new Error('event/email manquant');
    }

    const messageId = normalizeMessageId(
      payload['message-id'] ?? payload.messageId ?? payload.message_id,
    );
    const subject = clean(payload.subject) || null;
    const tag = clean(payload.tag) || null;
    const eventAt = parseEventAt(payload);

    const { error } = await this.supabase.getClient().from('email_events').insert({
      message_id: messageId,
      email,
      event,
      subject,
      tag,
      event_at: eventAt,
      raw: payload,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (event === 'hard_bounce' || event === 'spam') {
      try {
        await this.unsubscribe.addUnsubscribe(email, event);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[BrevoWebhook] addUnsubscribe failed email=${email} event=${event}: ${msg}`,
        );
      }
    }
  }
}
