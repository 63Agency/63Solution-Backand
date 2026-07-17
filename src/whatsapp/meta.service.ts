import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MetaSendMessageResult } from './types/whatsapp.types';
import { normalizePhoneNumber } from './utils/phone';
import {
  normalizeWhatsAppTemplates,
  type WhatsAppTemplate,
} from './utils/whatsapp-templates';

const WHATCHIMP_SEND_URL =
  'https://app.whatchimp.com/api/v1/whatsapp/send';
const META_MESSAGES_URL =
  'https://graph.facebook.com/v18.0/1180177848511875/messages';
const META_TEMPLATES_URL =
  'https://graph.facebook.com/v18.0/1551611006381024/message_templates';

type TemplateComponentInput = {
  type: string;
  parameters: { type: string; text: string }[];
};

function pickMessageId(raw: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    raw.wa_message_id,
    raw.id,
    raw.message_id,
    raw.messageId,
  ];
  const data = raw.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    candidates.push(d.id, d.message_id, d.messageId);
  }
  const messages = raw.messages;
  if (Array.isArray(messages) && messages[0] && typeof messages[0] === 'object') {
    const m = messages[0] as Record<string, unknown>;
    candidates.push(m.id);
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

  /** WhatsApp Business phone_number_id (WhatChimp account ID, not recipient number). */
  getPhoneNumberId(): string {
    return (
      this.configService.get<string>('WHATCHIMP_PHONE_NUMBER_ID')?.trim() ?? ''
    );
  }

  private getApiToken(): string {
    return this.configService.get<string>('WHATCHIMP_API_KEY')?.trim() ?? '';
  }

  private getMetaAccessToken(): string {
    return this.configService.get<string>('META_ACCESS_TOKEN')?.trim() ?? '';
  }

  private requireWhatChimpConfig(): { apiKey: string; phoneNumberId: string } {
    const apiKey = this.getApiToken();
    const phoneNumberId = this.getPhoneNumberId();

    if (!apiKey || !phoneNumberId) {
      throw new ServiceUnavailableException({
        message:
          'WhatChimp non configuré (WHATCHIMP_API_KEY / WHATCHIMP_PHONE_NUMBER_ID).',
      });
    }

    return { apiKey, phoneNumberId };
  }

  private requireMetaAccessToken(): string {
    const token = this.getMetaAccessToken();
    if (!token) {
      throw new ServiceUnavailableException({
        message: 'Meta non configuré (META_ACCESS_TOKEN).',
      });
    }
    return token;
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
    const { apiKey, phoneNumberId } = this.requireWhatChimpConfig();

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

    const apiStatus = String(raw.status ?? '').trim();
    const apiMessage =
      typeof raw.message === 'string'
        ? raw.message
        : typeof raw.error === 'string'
          ? raw.error
          : null;

    if (!res.ok || apiStatus === '0' || apiStatus === 'false') {
      const detail = apiMessage ?? JSON.stringify(raw).slice(0, 300);
      this.logger.warn(`WhatChimp sendMessage ${res.status}: ${detail}`);
      throw new ServiceUnavailableException({
        message: apiMessage
          ? `WhatChimp: ${apiMessage}`
          : `WhatChimp: envoi impossible (${res.status}).`,
      });
    }

    return {
      whatsappMessageId: pickMessageId(raw),
      text: messageText,
      status: 'sent',
      sentAt: new Date().toISOString(),
    };
  }

  async sendTemplateMessage(
    toPhone: string,
    templateName: string,
    language = 'fr',
    components?: TemplateComponentInput[],
    variable1?: string,
  ): Promise<MetaSendMessageResult> {
    const accessToken = this.requireMetaAccessToken();

    const phone = normalizePhoneNumber(toPhone);
    if (!phone) {
      throw new ServiceUnavailableException({
        message: 'Numéro WhatsApp invalide.',
      });
    }

    const languageCode = language.trim() || 'fr';

    // {{1}} is replaced by the first body text parameter (variable1).
    // Templates with no variables (e.g. proposal_sent_status) must send components: [].
    const fromComponents =
      components
        ?.find((c) => String(c.type ?? '').toLowerCase() === 'body')
        ?.parameters?.find((p) => typeof p.text === 'string' && p.text.trim())
        ?.text?.trim() ?? '';
    const resolvedVariable1 = (variable1?.trim() || fromComponents).trim();

    const templateComponents =
      resolvedVariable1.length > 0
        ? [
            {
              type: 'body',
              parameters: [{ type: 'text', text: resolvedVariable1 }],
            },
          ]
        : [];

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: templateComponents,
      },
    };

    this.logger.log(
      `Meta sendTemplate variable1=${JSON.stringify(resolvedVariable1 || null)}`,
    );
    this.logger.log(
      `Meta sendTemplate payload=${JSON.stringify(payload)}`,
    );

    const res = await fetch(META_MESSAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await res.text().catch(() => '');
    let raw: Record<string, unknown> = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      raw = { parseError: rawText.slice(0, 500) };
    }

    this.logger.log(
      `Meta sendTemplate response status=${res.status} body=${rawText.slice(0, 500)}`,
    );

    if (!res.ok) {
      const errObj =
        raw.error && typeof raw.error === 'object'
          ? (raw.error as Record<string, unknown>)
          : null;
      const apiMessage =
        (typeof errObj?.message === 'string' ? errObj.message : null) ??
        (typeof raw.message === 'string' ? raw.message : null) ??
        JSON.stringify(raw).slice(0, 300);
      this.logger.warn(`Meta sendTemplate ${res.status}: ${apiMessage}`);
      throw new ServiceUnavailableException({
        message: `Meta: ${apiMessage}`,
      });
    }

    const preview = resolvedVariable1
      ? `[Template: ${templateName}] ${resolvedVariable1}`
      : `[Template: ${templateName}]`;

    return {
      whatsappMessageId: pickMessageId(raw),
      text: preview,
      status: 'sent',
      sentAt: new Date().toISOString(),
    };
  }

  async listTemplates(): Promise<WhatsAppTemplate[]> {
    const accessToken = this.requireMetaAccessToken();

    this.logger.log(`[templates] GET ${META_TEMPLATES_URL}`);

    const res = await fetch(META_TEMPLATES_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    const rawText = await res.text().catch(() => '');
    let raw: unknown = {};
    try {
      raw = rawText ? JSON.parse(rawText) : {};
    } catch {
      raw = { parseError: rawText.slice(0, 500) };
    }

    this.logger.log(
      `[templates] status=${res.status} bodyPreview=${rawText.slice(0, 500)}`,
    );

    if (!res.ok) {
      const errObj =
        raw &&
        typeof raw === 'object' &&
        (raw as Record<string, unknown>).error &&
        typeof (raw as Record<string, unknown>).error === 'object'
          ? ((raw as Record<string, unknown>).error as Record<string, unknown>)
          : null;
      const apiMessage =
        (typeof errObj?.message === 'string' ? errObj.message : null) ??
        rawText.slice(0, 300);
      this.logger.warn(`[templates] Meta ${res.status}: ${apiMessage}`);
      throw new ServiceUnavailableException({
        message: `Meta templates: ${apiMessage}`,
      });
    }

    const templates = normalizeWhatsAppTemplates(raw);
    this.logger.log(
      `[templates] normalized count=${templates.length} names=${templates.map((t) => t.name).join(', ') || '(none)'}`,
    );

    return templates;
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
