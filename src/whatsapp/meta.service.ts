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
const WHATCHIMP_TEMPLATE_LIST_URL =
  'https://app.whatchimp.com/api/v1/whatsapp/template/list';
const META_MESSAGES_URL =
  'https://graph.facebook.com/v18.0/1180177848511875/messages';

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
    const fromComponents =
      components
        ?.find((c) => String(c.type ?? '').toLowerCase() === 'body')
        ?.parameters?.find((p) => typeof p.text === 'string' && p.text.trim())
        ?.text?.trim() ?? '';
    const resolvedVariable1 = (variable1?.trim() || fromComponents).trim();

    // Always send Meta's exact body-components shape when we have a value.
    const templateComponents =
      resolvedVariable1.length > 0
        ? [
            {
              type: 'body',
              parameters: [{ type: 'text', text: resolvedVariable1 }],
            },
          ]
        : (components
            ?.filter((c) => c.parameters?.length)
            .map((c) => ({
              type: String(c.type ?? 'body').toLowerCase(),
              parameters: c.parameters.map((p) => ({
                type: p.type || 'text',
                text: p.text,
              })),
            })) ?? []);

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(templateComponents.length > 0
          ? { components: templateComponents }
          : {}),
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
    const apiKey = this.getApiToken();
    const phoneNumberId = this.getPhoneNumberId();

    this.logger.log(
      `[templates] start apiKey=${apiKey ? 'set' : 'MISSING'} phoneNumberId=${phoneNumberId || 'MISSING'}`,
    );

    if (!apiKey) {
      throw new ServiceUnavailableException({
        message: 'WhatChimp non configuré (WHATCHIMP_API_KEY).',
      });
    }
    if (!phoneNumberId) {
      throw new ServiceUnavailableException({
        message: 'WhatChimp non configuré (WHATCHIMP_PHONE_NUMBER_ID).',
      });
    }

    const attempts: { method: string; url: string }[] = [
      {
        method: 'GET',
        url: `${WHATCHIMP_TEMPLATE_LIST_URL}?apiToken=${encodeURIComponent(apiKey)}&phone_number_id=${encodeURIComponent(phoneNumberId)}`,
      },
    ];

    const errors: string[] = [];

    for (const attempt of attempts) {
      const safeUrl = attempt.url.replace(apiKey, '***');
      this.logger.log(`[templates] ${attempt.method} ${safeUrl}`);

      try {
        const res = await fetch(attempt.url, {
          method: attempt.method,
          headers: { Accept: 'application/json' },
        });

        const rawText = await res.text().catch(() => '');
        let raw: unknown = {};
        try {
          raw = rawText ? JSON.parse(rawText) : {};
        } catch {
          raw = { parseError: rawText.slice(0, 300) };
        }

        this.logger.log(
          `[templates] ${attempt.method} status=${res.status} bodyPreview=${rawText.slice(0, 400)}`,
        );

        if (!res.ok) {
          errors.push(`${attempt.method} ${res.status}`);
          continue;
        }

        const templates = normalizeWhatsAppTemplates(raw);
        this.logger.log(
          `[templates] normalized count=${templates.length} names=${templates.map((t) => t.name).join(', ') || '(none)'}`,
        );

        if (templates.length > 0) {
          return templates;
        }

        errors.push(`${attempt.method}: liste vide après normalisation`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[templates] ${attempt.method} failed: ${message}`);
        errors.push(`${attempt.method}: ${message}`);
      }
    }

    // POST fallback (WhatChimp docs)
    const postUrl = WHATCHIMP_TEMPLATE_LIST_URL;
    this.logger.log(`[templates] POST ${postUrl} (form fallback)`);
    try {
      const body = new URLSearchParams({
        apiToken: apiKey,
        phone_number_id: phoneNumberId,
      });
      const res = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });

      const rawText = await res.text().catch(() => '');
      let raw: unknown = {};
      try {
        raw = rawText ? JSON.parse(rawText) : {};
      } catch {
        raw = { parseError: rawText.slice(0, 300) };
      }

      this.logger.log(
        `[templates] POST status=${res.status} bodyPreview=${rawText.slice(0, 400)}`,
      );

      if (res.ok) {
        const templates = normalizeWhatsAppTemplates(raw);
        this.logger.log(`[templates] POST normalized count=${templates.length}`);
        if (templates.length > 0) return templates;
        errors.push('POST: liste vide après normalisation');
      } else {
        errors.push(`POST ${res.status}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[templates] POST failed: ${message}`);
      errors.push(`POST: ${message}`);
    }

    this.logger.warn(`[templates] all attempts failed: ${errors.join('; ')}`);
    throw new ServiceUnavailableException({
      message: `Impossible de charger les templates WhatChimp (${errors.join('; ')})`,
    });
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
