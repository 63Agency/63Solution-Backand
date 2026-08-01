import {
  BadRequestException,
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

const META_MESSAGES_URL =
  'https://graph.facebook.com/v18.0/1180177848511875/messages';
const META_TEMPLATES_URL =
  'https://graph.facebook.com/v18.0/1551611006381024/message_templates';

function formatMetaSendError(errObj: Record<string, unknown> | null): string {
  const code = errObj?.code;
  const apiMessage =
    typeof errObj?.message === 'string' ? errObj.message : '';
  const lower = apiMessage.toLowerCase();

  // Meta 24h customer care window (131047, 131026, etc.)
  if (
    code === 131047 ||
    code === 131026 ||
    lower.includes('24 hour') ||
    lower.includes('24-hour') ||
    lower.includes('re-engagement') ||
    lower.includes('more than 24 hours')
  ) {
    return (
      'Fenêtre de 24 h expirée : vous ne pouvez envoyer qu’un message template ' +
      'jusqu’à ce que le contact réponde.'
    );
  }

  return apiMessage || 'Envoi Meta impossible.';
}

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
        'META_ACCESS_TOKEN manquant — envoi WhatsApp désactivé.',
      );
    }
  }

  isConfigured(): boolean {
    const token =
      this.configService.get<string>('META_ACCESS_TOKEN')?.trim() ?? '';
    return Boolean(token);
  }

  getVerifyToken(): string {
    return '';
  }

  /** WhatsApp Business phone_number_id (Meta Cloud API). */
  getPhoneNumberId(): string {
    return (
      this.configService.get<string>('WHATCHIMP_PHONE_NUMBER_ID')?.trim() ??
      this.configService.get<string>('META_PHONE_NUMBER_ID')?.trim() ??
      ''
    );
  }

  private getApiToken(): string {
    return this.configService.get<string>('WHATCHIMP_API_KEY')?.trim() ?? '';
  }

  private getMetaAccessToken(): string {
    return this.configService.get<string>('META_ACCESS_TOKEN')?.trim() ?? '';
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
    options?: { replyToMessageId?: string },
  ): Promise<MetaSendMessageResult> {
    return this.sendTextMessageViaMeta(
      toPhone,
      messageText,
      options?.replyToMessageId,
    );
  }

  /**
   * Envoi texte via Meta Graph API, avec citation optionnelle (reply).
   * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages#replies
   */
  async sendTextMessageViaMeta(
    toPhone: string,
    messageText: string,
    replyToMessageId?: string,
  ): Promise<MetaSendMessageResult> {
    const accessToken = this.requireMetaAccessToken();

    const phone = normalizePhoneNumber(toPhone);
    if (!phone) {
      throw new ServiceUnavailableException({
        message: 'Numéro WhatsApp invalide.',
      });
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: {
        preview_url: true,
        body: messageText,
      },
    };

    const contextId = replyToMessageId?.trim();
    if (contextId) {
      payload.context = { message_id: contextId };
    }

    this.logger.log(
      `Meta sendText replyTo=${contextId ?? '(none)'} to=${phone}`,
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
      `Meta sendText response status=${res.status} body=${rawText.slice(0, 500)}`,
    );

    if (!res.ok) {
      const errObj =
        raw.error && typeof raw.error === 'object'
          ? (raw.error as Record<string, unknown>)
          : null;
      const apiMessage =
        formatMetaSendError(errObj) ||
        (typeof raw.message === 'string' ? raw.message : null) ||
        JSON.stringify(raw).slice(0, 300);
      this.logger.warn(`Meta sendText ${res.status}: ${apiMessage}`);
      throw new ServiceUnavailableException({
        message: `Meta: ${apiMessage}`,
      });
    }

    return {
      whatsappMessageId: pickMessageId(raw),
      text: messageText,
      status: 'sent',
      sentAt: new Date().toISOString(),
    };
  }

  /**
   * Envoi média (image / video / document) via lien HTTPS public (Cloudinary).
   * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
   */
  async sendMediaMessageViaMeta(
    toPhone: string,
    input: {
      type: 'image' | 'video' | 'document';
      mediaUrl: string;
      caption?: string;
      fileName?: string;
      replyToMessageId?: string;
    },
  ): Promise<MetaSendMessageResult> {
    const accessToken = this.requireMetaAccessToken();

    const phone = normalizePhoneNumber(toPhone);
    if (!phone) {
      throw new ServiceUnavailableException({
        message: 'Numéro WhatsApp invalide.',
      });
    }

    const caption = input.caption?.trim() || undefined;
    const mediaPayload: Record<string, unknown> = {
      link: input.mediaUrl.trim(),
    };
    if (caption) mediaPayload.caption = caption;
    if (input.type === 'document' && input.fileName?.trim()) {
      mediaPayload.filename = input.fileName.trim();
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: input.type,
      [input.type]: mediaPayload,
    };

    const contextId = input.replyToMessageId?.trim();
    if (contextId) {
      payload.context = { message_id: contextId };
    }

    this.logger.log(
      `Meta sendMedia type=${input.type} replyTo=${contextId ?? '(none)'} to=${phone}`,
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
      `Meta sendMedia response status=${res.status} body=${rawText.slice(0, 500)}`,
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
      this.logger.warn(`Meta sendMedia ${res.status}: ${apiMessage}`);
      throw new ServiceUnavailableException({
        message: `Meta: ${apiMessage}`,
      });
    }

    return {
      whatsappMessageId: pickMessageId(raw),
      text: caption || input.fileName || `[${input.type}]`,
      status: 'sent',
      sentAt: new Date().toISOString(),
    };
  }

  async sendTemplateMessage(
    toPhone: string,
    templateName: string,
    language = 'fr',
    _components?: TemplateComponentInput[],
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

    // Prefer explicit body components when they contain real text params
    // (e.g. meeting_reminder_date with {{1}} {{2}} {{3}}).
    // Otherwise fall back to variable1. Empty / "{{n}}" → components: []
    // to avoid Meta #132000 on no-variable templates.
    const bodyParamsFromComponents = (_components ?? [])
      .filter((c) => String(c.type).toLowerCase() === 'body')
      .flatMap((c) => c.parameters ?? [])
      .map((p) => String(p.text ?? '').trim())
      .filter((t) => t && !/^\{\{\d+\}\}$/.test(t));

    const rawVariable1 = variable1?.trim() ?? '';
    const resolvedVariable1 =
      rawVariable1 && !/^\{\{\d+\}\}$/.test(rawVariable1) ? rawVariable1 : '';

    const templateComponents =
      bodyParamsFromComponents.length > 0
        ? [
            {
              type: 'body',
              parameters: bodyParamsFromComponents.map((text) => ({
                type: 'text',
                text,
              })),
            },
          ]
        : resolvedVariable1
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
      `Meta sendTemplate bodyParams=${JSON.stringify(
        bodyParamsFromComponents.length > 0
          ? bodyParamsFromComponents
          : resolvedVariable1 || null,
      )}`,
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

    const previewTexts =
      bodyParamsFromComponents.length > 0
        ? bodyParamsFromComponents
        : resolvedVariable1
          ? [resolvedVariable1]
          : [];
    const preview = previewTexts.length
      ? `[Template: ${templateName}] ${previewTexts.join(' | ')}`
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

  /**
   * Attempt to revoke an outbound message on the contact's phone (« supprimer pour tout le monde »).
   *
   * Official WhatsApp Cloud API does not document a reliable delete/revoke endpoint.
   * We try the same Messages endpoint with `status: "deleted"` (mirrors mark-as-read).
   * On rejection (unsupported, too old, invalid wamid), throw a clear 4xx for the CRM toast.
   */
  async deleteMessageForEveryone(metaMessageId: string): Promise<void> {
    const accessToken = this.requireMetaAccessToken();
    const messageId = metaMessageId.trim();
    if (!messageId) {
      throw new BadRequestException({
        message: 'metaMessageId manquant — impossible de révoquer sur WhatsApp.',
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      status: 'deleted',
      message_id: messageId,
    };

    this.logger.log(`Meta deleteMessage message_id=${messageId}`);

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
      `Meta deleteMessage status=${res.status} body=${rawText.slice(0, 500)}`,
    );

    if (!res.ok) {
      const errObj =
        raw.error && typeof raw.error === 'object'
          ? (raw.error as Record<string, unknown>)
          : null;
      const apiMessage =
        (typeof errObj?.message === 'string' ? errObj.message : null) ||
        (typeof raw.message === 'string' ? raw.message : null) ||
        rawText.slice(0, 300) ||
        'révocation Meta impossible';

      const lower = apiMessage.toLowerCase();
      const unsupported =
        lower.includes('status') ||
        lower.includes('deleted') ||
        lower.includes('unsupported') ||
        lower.includes('not supported') ||
        errObj?.code === 100;

      throw new BadRequestException({
        message: unsupported
          ? `Suppression pour tout le monde indisponible via Cloud API : ${apiMessage}. Utilisez « Supprimer pour moi » (CRM uniquement).`
          : `Meta: ${apiMessage}`,
      });
    }
  }

  /**
   * Resolve a Meta media id to a temporary download URL.
   * GET https://graph.facebook.com/v18.0/<mediaId>
   */
  async getMediaUrl(mediaId: string): Promise<{
    url: string;
    mimeType: string | null;
    mediaId: string;
    fileSize: number | null;
  }> {
    const accessToken = this.requireMetaAccessToken();
    const id = mediaId.trim();
    if (!id) {
      throw new ServiceUnavailableException({
        message: 'mediaId requis.',
      });
    }

    const metaUrl = `https://graph.facebook.com/v19.0/${encodeURIComponent(id)}`;
    this.logger.log(`Meta getMedia GET ${metaUrl}`);

    const res = await fetch(metaUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    const rawText = await res.text().catch(() => '');
    let raw: Record<string, unknown> = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      raw = { parseError: rawText.slice(0, 500) };
    }

    this.logger.log(
      `Meta getMedia status=${res.status} body=${rawText.slice(0, 400)}`,
    );

    if (!res.ok) {
      const errObj =
        raw.error && typeof raw.error === 'object'
          ? (raw.error as Record<string, unknown>)
          : null;
      const apiMessage =
        (typeof errObj?.message === 'string' ? errObj.message : null) ??
        rawText.slice(0, 300);
      throw new ServiceUnavailableException({
        message: `Meta media: ${apiMessage}`,
      });
    }

    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    if (!url) {
      throw new ServiceUnavailableException({
        message: 'Meta media: URL manquante.',
      });
    }

    return {
      url,
      mimeType: typeof raw.mime_type === 'string' ? raw.mime_type : null,
      mediaId: typeof raw.id === 'string' ? raw.id : id,
      fileSize: typeof raw.file_size === 'number' ? raw.file_size : null,
    };
  }

  /**
   * Download media bytes from Meta (URL requires Bearer token — not playable
   * directly in a browser <audio src>).
   */
  async downloadMedia(mediaId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    mediaId: string;
    fileSize: number | null;
  }> {
    const info = await this.getMediaUrl(mediaId);
    const accessToken = this.requireMetaAccessToken();

    const res = await fetch(info.url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(
        `Meta downloadMedia ${res.status}: ${detail.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException({
        message: `Meta media download failed (${res.status}).`,
      });
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      buffer,
      mimeType: info.mimeType || 'application/octet-stream',
      mediaId: info.mediaId,
      fileSize: info.fileSize ?? buffer.length,
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
