import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MetaSendMessageResult } from './types/whatsapp.types';
import { normalizePhoneNumber } from './utils/phone';

const WHATCHIMP_SEND_URL =
  'https://app.whatchimp.com/api/v1/whatsapp/send';

function pickMessageId(raw: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    raw.id,
    raw.message_id,
    raw.messageId,
  ];
  const data = raw.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    candidates.push(d.id, d.message_id, d.messageId);
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(private readonly configService: ConfigService) {
    if (!this.isConfigured()) {
      this.logger.warn(
        'WHATCHIMP_API_KEY ou WHATCHIMP_PHONE_NUMBER_ID manquant — envoi WhatsApp désactivé.',
      );
    }
  }

  isConfigured(): boolean {
    const apiKey =
      this.configService.get<string>('WHATCHIMP_API_KEY')?.trim() ?? '';
    const phoneNumberId =
      this.configService.get<string>('WHATCHIMP_PHONE_NUMBER_ID')?.trim() ?? '';
    return Boolean(apiKey && phoneNumberId);
  }

  getVerifyToken(): string {
    return '';
  }

  /** WhatChimp n'utilise pas le hub challenge Meta — accepter toute requête GET. */
  verifyWebhook(
    _mode: string | undefined,
    _token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    return challenge?.trim() || 'ok';
  }

  async sendTextMessage(
    toPhone: string,
    messageText: string,
  ): Promise<MetaSendMessageResult> {
    const apiKey =
      this.configService.get<string>('WHATCHIMP_API_KEY')?.trim() ?? '';
    const phoneNumberId =
      this.configService.get<string>('WHATCHIMP_PHONE_NUMBER_ID')?.trim() ?? '';

    if (!apiKey || !phoneNumberId) {
      throw new ServiceUnavailableException({
        message:
          'WhatChimp non configuré (WHATCHIMP_API_KEY / WHATCHIMP_PHONE_NUMBER_ID).',
      });
    }

    const phone = normalizePhoneNumber(toPhone);
    if (!phone) {
      throw new ServiceUnavailableException({
        message: 'Numéro WhatsApp invalide.',
      });
    }

    const body = new URLSearchParams({
      apiToken: apiKey,
      phone_number_id: phoneNumberId,
      phone_number: phone,
      message: messageText,
    });

    const res = await fetch(WHATCHIMP_SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail =
        typeof raw.message === 'string'
          ? raw.message
          : typeof raw.error === 'string'
            ? raw.error
            : JSON.stringify(raw).slice(0, 300);
      this.logger.warn(`WhatChimp sendMessage ${res.status}: ${detail}`);
      throw new ServiceUnavailableException({
        message: `WhatChimp: envoi impossible (${res.status}).`,
      });
    }

    return {
      whatsappMessageId: pickMessageId(raw),
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
