import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WatiSendSessionResult } from './types/whatsapp.types';
import { normalizePhoneNumber } from './utils/phone';

function normalizeWatiBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

@Injectable()
export class WatiService {
  private readonly logger = new Logger(WatiService.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly channelNumber: string | null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('WATI_API_URL')?.trim() ?? '';
    const token = this.config.get<string>('WATI_API_TOKEN')?.trim() ?? '';
    if (!url || !token) {
      this.logger.warn(
        'WATI_API_URL ou WATI_API_TOKEN manquant — envoi WhatsApp désactivé.',
      );
    }
    this.baseUrl = url ? normalizeWatiBaseUrl(url) : '';
    this.token = token;
    const ch = this.config.get<string>('WATI_CHANNEL_NUMBER')?.trim();
    this.channelNumber = ch ? normalizePhoneNumber(ch) : null;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  async sendSessionMessage(
    whatsappNumber: string,
    messageText: string,
  ): Promise<WatiSendSessionResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        message: 'Wati non configuré (WATI_API_URL / WATI_API_TOKEN).',
      });
    }

    const phone = normalizePhoneNumber(whatsappNumber);
    if (!phone) {
      throw new ServiceUnavailableException({
        message: 'Numéro WhatsApp invalide.',
      });
    }

    const url = new URL(
      `${this.baseUrl}/api/v1/sendSessionMessage/${encodeURIComponent(phone)}`,
    );
    url.searchParams.set('messageText', messageText);
    if (this.channelNumber) {
      url.searchParams.set('channelPhoneNumber', this.channelNumber);
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail =
        typeof raw.message === 'string'
          ? raw.message
          : JSON.stringify(raw).slice(0, 300);
      this.logger.warn(`Wati sendSessionMessage ${res.status}: ${detail}`);
      throw new ServiceUnavailableException({
        message: `Wati: envoi impossible (${res.status}).`,
      });
    }

    const msg =
      raw.message && typeof raw.message === 'object'
        ? (raw.message as Record<string, unknown>)
        : {};

    const timeRaw = msg.time ?? msg.created;
    let sentAt: string | null = null;
    if (typeof timeRaw === 'string' && /^\d+$/.test(timeRaw)) {
      sentAt = new Date(Number(timeRaw) * 1000).toISOString();
    } else if (typeof timeRaw === 'string') {
      sentAt = timeRaw;
    }

    const statusString =
      typeof msg.statusString === 'string'
        ? msg.statusString
        : typeof msg.status === 'number'
          ? String(msg.status)
          : 'sent';

    return {
      ok: Boolean(raw.ok ?? true),
      whatsappMessageId:
        typeof msg.whatsappMessageId === 'string'
          ? msg.whatsappMessageId
          : null,
      watiLocalId:
        typeof msg.id === 'string'
          ? msg.id
          : typeof msg.localMessageId === 'string'
            ? msg.localMessageId
            : null,
      watiConversationId:
        typeof msg.conversationId === 'string' ? msg.conversationId : null,
      text: typeof msg.text === 'string' ? msg.text : messageText,
      status: mapWatiStatus(statusString),
      sentAt,
    };
  }
}

export function mapWatiStatus(raw: string | undefined | null): string {
  const s = String(raw ?? 'sent').trim().toLowerCase();
  if (s.includes('read')) return 'read';
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('fail')) return 'failed';
  if (s.includes('sent') || s === '1') return 'sent';
  return s || 'sent';
}
