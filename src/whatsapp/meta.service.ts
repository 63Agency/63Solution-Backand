import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MetaSendMessageResult } from './types/whatsapp.types';
import { normalizePhoneNumber } from './utils/phone';

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly graphVersion: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken =
      this.config.get<string>('META_ACCESS_TOKEN')?.trim() ?? '';
    this.phoneNumberId =
      this.config.get<string>('META_PHONE_NUMBER_ID')?.trim() ?? '';
    this.graphVersion =
      this.config.get<string>('META_GRAPH_API_VERSION')?.trim() || 'v18.0';

    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn(
        'META_ACCESS_TOKEN ou META_PHONE_NUMBER_ID manquant — envoi WhatsApp désactivé.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  getVerifyToken(): string {
    return this.config.get<string>('META_VERIFY_TOKEN')?.trim() ?? '';
  }

  verifyWebhook(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    const expected = this.getVerifyToken();
    if (
      mode === 'subscribe' &&
      expected &&
      token === expected &&
      challenge?.trim()
    ) {
      return challenge;
    }
    return null;
  }

  async sendTextMessage(
    toPhone: string,
    messageText: string,
  ): Promise<MetaSendMessageResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        message:
          'Meta WhatsApp non configuré (META_ACCESS_TOKEN / META_PHONE_NUMBER_ID).',
      });
    }

    const to = normalizePhoneNumber(toPhone);
    if (!to) {
      throw new ServiceUnavailableException({
        message: 'Numéro WhatsApp invalide.',
      });
    }

    const url = `https://graph.facebook.com/${this.graphVersion}/${encodeURIComponent(this.phoneNumberId)}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: messageText },
      }),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errObj = raw.error as Record<string, unknown> | undefined;
      const detail =
        typeof errObj?.message === 'string'
          ? errObj.message
          : JSON.stringify(raw).slice(0, 300);
      this.logger.warn(`Meta sendMessage ${res.status}: ${detail}`);
      throw new ServiceUnavailableException({
        message: `Meta: envoi impossible (${res.status}).`,
      });
    }

    const messages = Array.isArray(raw.messages) ? raw.messages : [];
    const first = messages[0] as Record<string, unknown> | undefined;
    const whatsappMessageId =
      typeof first?.id === 'string' ? first.id : null;

    return {
      whatsappMessageId,
      text: messageText,
      status: 'sent',
      sentAt: new Date().toISOString(),
    };
  }
}

export function mapMetaStatus(raw: string | undefined | null): string {
  const s = String(raw ?? 'sent').trim().toLowerCase();
  if (s.includes('read')) return 'read';
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('fail')) return 'failed';
  if (s.includes('sent')) return 'sent';
  return s || 'sent';
}
