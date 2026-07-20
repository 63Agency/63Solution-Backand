import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { BroadcastWhatsappMessageDto } from './dto/broadcast-whatsapp-message.dto';
import type {
  MessageDirection,
  WhatsappConversation,
  WhatsappMessage,
} from './types/whatsapp.types';
import { mapMetaStatus, MetaService } from './meta.service';
import { normalizePhoneNumber } from './utils/phone';
import {
  formatSupabaseError,
  stringifyForLog,
} from './utils/whatsapp-debug-log';

const INBOUND_MEDIA_TYPES = new Set(['image', 'video', 'document', 'audio']);
const MEDIA_UNAVAILABLE = 'Media unavailable';

type ConversationRow = {
  id: string;
  phone_number: string;
  contact_name: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  status: string;
  source: string;
  wati_contact_id: string | null;
  wati_conversation_id: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  direction: string;
  body: string | null;
  type: string;
  status: string;
  wati_message_id: string | null;
  sent_at: string | null;
  created_at: string;
  reply_to_wati_message_id?: string | null;
  reply_to_preview?: string | null;
  reply_to_author?: string | null;
  media_url?: string | null;
  file_name?: string | null;
  file_size?: number | null;
};

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function extractMetaMediaBlock(
  msg: Record<string, unknown>,
  type: string,
): {
  mediaId: string;
  mimeType: string;
  caption: string;
  fileName: string;
} | null {
  if (!INBOUND_MEDIA_TYPES.has(type)) return null;
  const media = msg[type];
  if (!media || typeof media !== 'object') return null;
  const m = media as Record<string, unknown>;
  return {
    mediaId: pickStr(m, 'id'),
    mimeType: pickStr(m, 'mime_type', 'mimeType'),
    caption: pickStr(m, 'caption'),
    fileName: pickStr(m, 'filename', 'file_name', 'name'),
  };
}

function extensionFromMime(mimeType: string, type: string): string {
  const mime = mimeType.toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  if (map[mime]) return map[mime];
  if (type === 'image') return 'jpg';
  if (type === 'video') return 'mp4';
  if (type === 'audio') return 'ogg';
  return 'bin';
}

function cloudinaryResourceTypeFor(
  type: string,
): 'image' | 'video' | 'raw' {
  if (type === 'image') return 'image';
  if (type === 'video' || type === 'audio') return 'video';
  return 'raw';
}

function extractMetaMessageBody(msg: Record<string, unknown>): string {
  const type = pickStr(msg, 'type');

  if (INBOUND_MEDIA_TYPES.has(type)) {
    const block = extractMetaMediaBlock(msg, type);
    if (block?.caption) return block.caption;
    if (type === 'document' && block?.fileName) return block.fileName;
    return '';
  }

  if (type === 'text') {
    const text = msg.text;
    if (text && typeof text === 'object') {
      return pickStr(text as Record<string, unknown>, 'body');
    }
    return '';
  }
  if (type === 'button') {
    const button = msg.button;
    if (button && typeof button === 'object') {
      return pickStr(button as Record<string, unknown>, 'text');
    }
  }
  if (type === 'interactive') {
    const interactive = msg.interactive;
    if (interactive && typeof interactive === 'object') {
      const ir = interactive as Record<string, unknown>;
      const buttonReply = ir.button_reply;
      if (buttonReply && typeof buttonReply === 'object') {
        return pickStr(
          buttonReply as Record<string, unknown>,
          'title',
          'id',
        );
      }
    }
  }
  const caption = pickStr(msg, 'caption');
  if (caption) return caption;
  return type ? `[${type}]` : '';
}

function extractReplyContext(msg: Record<string, unknown>): {
  wamid: string;
  from: string;
} {
  const candidates: unknown[] = [
    msg.context,
    msg.reply_to,
    msg.quoted_message,
    msg.referred_message,
  ];

  // Some providers nest under interactive / raw
  const interactive = msg.interactive;
  if (interactive && typeof interactive === 'object') {
    candidates.push((interactive as Record<string, unknown>).context);
  }

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue;
    const ctx = raw as Record<string, unknown>;
    const wamid = pickStr(ctx, 'id', 'message_id', 'messageId', 'wamid');
    if (wamid) {
      return { wamid, from: pickStr(ctx, 'from', 'wa_id') };
    }
  }

  // Rare top-level aliases
  const top = pickStr(
    msg,
    'context_id',
    'contextId',
    'quoted_message_id',
    'reply_to_message_id',
  );
  if (top) return { wamid: top, from: '' };

  return { wamid: '', from: '' };
}

function previewForConversation(type: string, body: string): string {
  if (type === 'audio') return 'Audio';
  if (type === 'image') return 'Photo';
  if (type === 'video') return 'Vidéo';
  if (type === 'document') return body.trim() || 'Document';
  return body;
}

function mapConversation(row: ConversationRow): WhatsappConversation {
  return {
    id: String(row.id),
    phoneNumber: String(row.phone_number),
    contactName: String(row.contact_name ?? ''),
    lastMessageText: String(row.last_message_text ?? ''),
    lastMessageAt: row.last_message_at ? String(row.last_message_at) : null,
    unreadCount: Number(row.unread_count ?? 0),
    status: String(row.status ?? 'open'),
    source: String(row.source ?? 'meta'),
  };
}

function mapMessage(row: MessageRow): WhatsappMessage {
  const type = String(row.type ?? 'text');
  const body = String(row.body ?? '');
  const watiMessageId = row.wati_message_id ? String(row.wati_message_id) : null;
  const replyWamid = row.reply_to_wati_message_id
    ? String(row.reply_to_wati_message_id).trim()
    : '';
  const replyPreview = row.reply_to_preview
    ? String(row.reply_to_preview).trim()
    : '';
  const replyAuthor = row.reply_to_author
    ? String(row.reply_to_author).trim()
    : '';
  const mediaUrl =
    typeof row.media_url === 'string' && row.media_url.trim()
      ? row.media_url.trim()
      : null;
  const fileName =
    typeof row.file_name === 'string' && row.file_name.trim()
      ? row.file_name.trim()
      : null;
  const fileSize =
    typeof row.file_size === 'number' && Number.isFinite(row.file_size)
      ? row.file_size
      : null;

  // Legacy audio: Meta media id was stored in body (numeric). Prefer mediaUrl when set.
  const legacyAudioId =
    type === 'audio' && !mediaUrl && /^\d+$/.test(body.trim())
      ? body.trim()
      : null;

  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    direction: row.direction as MessageDirection,
    body,
    type,
    mediaId: legacyAudioId,
    mediaUrl,
    fileName,
    fileSize,
    status: String(row.status ?? 'sent'),
    watiMessageId,
    metaMessageId: watiMessageId,
    createdAt: String(row.sent_at ?? row.created_at),
    replyTo:
      replyWamid || replyPreview
        ? {
            id: replyWamid || String(row.id),
            body: replyPreview || 'Message',
            authorLabel: replyAuthor || 'Contact',
          }
        : null,
  };
}

const MESSAGE_SELECT =
  'id, conversation_id, direction, body, type, status, wati_message_id, sent_at, created_at, reply_to_wati_message_id, reply_to_preview, reply_to_author, media_url, file_name, file_size';

function parseWebhookTimestamp(raw: string): string | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const ms = n > 1e12 ? n : n * 1000;
    return new Date(ms).toISOString();
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(
  cursor: string | undefined,
): { createdAt: string; id: string } | null {
  if (!cursor?.trim()) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt?: string; id?: string };
    if (parsed.createdAt && parsed.id) {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
  } catch {
    return null;
  }
  return null;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly meta: MetaService,
    private readonly notifications: NotificationsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  verifyMetaWebhook(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    return this.meta.verifyWebhook(mode, token, challenge);
  }

  async listTemplates() {
    this.logger.log('[templates] listTemplates requested');
    const templates = await this.meta.listTemplates();
    this.logger.log(`[templates] returning ${templates.length} template(s)`);
    return { templates };
  }

  async getMediaUrl(mediaId: string) {
    return this.meta.getMediaUrl(mediaId);
  }

  async getMediaContent(mediaId: string) {
    return this.meta.downloadMedia(mediaId);
  }

  async listConversations(): Promise<WhatsappConversation[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_conversations')
      .select(
        'id, phone_number, contact_name, last_message_text, last_message_at, unread_count, status, source',
      )
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return (data ?? []).map((r) => mapConversation(r as ConversationRow));
  }

  async getConversation(id: string): Promise<WhatsappConversation> {
    const row = await this.conversationByIdOr404(id);
    return mapConversation(row);
  }

  async listMessages(
    conversationId: string,
    limit = 200,
    cursor?: string,
  ): Promise<{ items: WhatsappMessage[]; nextCursor: string | null }> {
    await this.conversationByIdOr404(conversationId);
    const take = Math.min(Math.max(limit, 1), 500);
    const decoded = decodeCursor(cursor);

    let query = this.supabase
      .getClient()
      .from('whatsapp_messages')
      .select(
        MESSAGE_SELECT,
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(take + 1);

    if (decoded) {
      query = query.gt('created_at', decoded.createdAt);
    }

    const { data, error } = await query;
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const rows = (data ?? []) as MessageRow[];
    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    const items = slice.map(mapMessage);
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor(String(last.created_at), String(last.id))
        : null;

    return { items, nextCursor };
  }

  async sendMessage(
    conversationId: string,
    dto: SendWhatsappMessageDto,
  ): Promise<WhatsappMessage> {
    const conv = await this.conversationByIdOr404(conversationId);
    const quote = await this.resolveReplyQuote(
      conversationId,
      dto.replyToMessageId,
      conv.contact_name,
    );

    const mediaUrl = dto.mediaUrl?.trim();
    const mediaType = dto.type;
    const caption = (dto.text ?? '').trim();

    if (mediaUrl && mediaType) {
      const sent = await this.meta.sendMediaMessageViaMeta(conv.phone_number, {
        type: mediaType,
        mediaUrl,
        caption: caption || undefined,
        fileName: dto.fileName?.trim(),
        replyToMessageId: quote?.watiMessageId,
      });

      const now = new Date().toISOString();
      const bodyForStore =
        caption ||
        dto.fileName?.trim() ||
        (mediaType === 'image'
          ? 'Photo'
          : mediaType === 'video'
            ? 'Vidéo'
            : 'Document');

      const message = await this.persistMessage({
        conversationId: conv.id,
        direction: 'outbound',
        body: bodyForStore,
        type: mediaType,
        status: sent.status,
        watiMessageId: sent.whatsappMessageId,
        watiLocalId: null,
        sentAt: sent.sentAt ?? now,
        incrementUnread: false,
        replyToWatiMessageId: quote?.watiMessageId ?? null,
        replyToPreview: quote?.preview ?? null,
        replyToAuthor: quote?.authorLabel ?? null,
        mediaUrl,
        fileName: dto.fileName?.trim() || null,
        fileSize:
          typeof dto.fileSize === 'number' && Number.isFinite(dto.fileSize)
            ? dto.fileSize
            : null,
      });

      await this.touchConversation(conv.id, {
        lastMessageText: previewForConversation(mediaType, bodyForStore),
        lastMessageAt: sent.sentAt ?? now,
        contactName: conv.contact_name,
        watiContactId: conv.wati_contact_id,
        watiConversationId: conv.wati_conversation_id,
      });

      return message;
    }

    const text = caption;
    if (!text) {
      throw new BadRequestException({ message: 'text requis' });
    }

    const sent = await this.meta.sendTextMessage(
      conv.phone_number,
      text,
      quote?.watiMessageId
        ? { replyToMessageId: quote.watiMessageId }
        : undefined,
    );

    const now = new Date().toISOString();
    const message = await this.persistMessage({
      conversationId: conv.id,
      direction: 'outbound',
      body: sent.text,
      type: 'text',
      status: sent.status,
      watiMessageId: sent.whatsappMessageId,
      watiLocalId: null,
      sentAt: sent.sentAt ?? now,
      incrementUnread: false,
      replyToWatiMessageId: quote?.watiMessageId ?? null,
      replyToPreview: quote?.preview ?? null,
      replyToAuthor: quote?.authorLabel ?? null,
    });

    await this.touchConversation(conv.id, {
      lastMessageText: sent.text,
      lastMessageAt: sent.sentAt ?? now,
      contactName: conv.contact_name,
      watiContactId: conv.wati_contact_id,
      watiConversationId: conv.wati_conversation_id,
    });

    return message;
  }

  /**
   * Accepte un wamid Meta (wamid.…) ou l'uuid interne du message, et retourne
   * les métadonnées de citation à stocker + envoyer à Meta.
   */
  private async resolveReplyQuote(
    conversationId: string,
    replyToMessageId: string | undefined,
    contactName: string | null,
  ): Promise<{
    watiMessageId: string;
    preview: string;
    authorLabel: string;
  } | null> {
    const raw = replyToMessageId?.trim();
    if (!raw) return null;

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    let row: MessageRow | null = null;

    if (uuidRe.test(raw)) {
      const { data, error } = await this.supabase
        .getClient()
        .from('whatsapp_messages')
        .select(MESSAGE_SELECT)
        .eq('id', raw)
        .maybeSingle();
      if (error) {
        this.logger.warn(
          `resolveReplyQuote uuid lookup failed: ${formatSupabaseError(error)}`,
        );
        throw new BadRequestException({
          message: 'Impossible de résoudre le message cité.',
        });
      }
      row = (data as MessageRow | null) ?? null;
    } else {
      const { data, error } = await this.supabase
        .getClient()
        .from('whatsapp_messages')
        .select(MESSAGE_SELECT)
        .eq('wati_message_id', raw)
        .maybeSingle();
      if (error) {
        this.logger.warn(
          `resolveReplyQuote wamid lookup failed: ${formatSupabaseError(error)}`,
        );
        throw new BadRequestException({
          message: 'Impossible de résoudre le message cité.',
        });
      }
      row = (data as MessageRow | null) ?? null;
      // Si le wamid n'est pas encore en base, on peut quand même répondre via Meta
      if (!row && (raw.startsWith('wamid.') || raw.startsWith('wamid'))) {
        return {
          watiMessageId: raw,
          preview: 'Message',
          authorLabel: contactName?.trim() || 'Contact',
        };
      }
    }

    if (!row || String(row.conversation_id) !== conversationId) {
      throw new BadRequestException({
        message: 'Message cité introuvable dans cette conversation.',
      });
    }

    const wamid =
      typeof row.wati_message_id === 'string'
        ? row.wati_message_id.trim()
        : '';
    if (!wamid) {
      throw new BadRequestException({
        message:
          'Ce message n’a pas d’id Meta — impossible de répondre avec citation WhatsApp.',
      });
    }

    const type = String(row.type ?? 'text');
    const body = String(row.body ?? '');
    const preview =
      type === 'audio'
        ? 'Audio'
        : type === 'image'
          ? 'Photo'
          : type === 'video'
            ? 'Vidéo'
            : type === 'document'
              ? 'Document'
              : body.trim().slice(0, 120) || 'Message';

    const authorLabel =
      row.direction === 'outbound'
        ? 'Vous'
        : contactName?.trim() || 'Contact';

    return { watiMessageId: wamid, preview, authorLabel };
  }

  async broadcastMessage(dto: BroadcastWhatsappMessageDto): Promise<{
    sent: number;
    failed: number;
    results: { phoneNumber: string; success: boolean; error?: string }[];
  }> {
    const templateName = dto.templateName?.trim() ?? '';
    const isTemplate = Boolean(templateName);
    const text = dto.text?.trim() ?? '';
    const templateLanguage = dto.templateLanguage?.trim() || 'fr';
    const variable1 = dto.variable1?.trim() || undefined;
    const components = dto.components?.map((c) => ({
      type: c.type,
      parameters: c.parameters.map((p) => ({ type: p.type, text: p.text })),
    }));

    const results: { phoneNumber: string; success: boolean; error?: string }[] =
      [];
    const phones = dto.phoneNumbers.map((p) => String(p).trim()).filter(Boolean);

    for (let i = 0; i < phones.length; i++) {
      const phoneNumber = phones[i];
      const phone = normalizePhoneNumber(phoneNumber);

      if (!phone) {
        results.push({
          phoneNumber,
          success: false,
          error: 'Numéro WhatsApp invalide.',
        });
        if (i < phones.length - 1) {
          await this.delay(300);
        }
        continue;
      }

      try {
        const sent = isTemplate
          ? await this.meta.sendTemplateMessage(
              phone,
              templateName,
              templateLanguage,
              components,
              variable1,
            )
          : await this.meta.sendTextMessage(phone, text);
        const now = new Date().toISOString();
        const sentAt = sent.sentAt ?? now;

        const conv = await this.findOrCreateConversation({
          phone,
          contactName: null,
          watiContactId: phone,
          watiConversationId: null,
          source: 'meta',
          lastMessageText: sent.text,
          lastMessageAt: sentAt,
          incrementUnread: false,
        });

        await this.persistMessage({
          conversationId: conv.id,
          direction: 'outbound',
          body: sent.text,
          type: isTemplate ? 'template' : 'text',
          status: sent.status,
          watiMessageId: sent.whatsappMessageId,
          watiLocalId: null,
          sentAt,
          incrementUnread: false,
        });

        results.push({ phoneNumber, success: true });
      } catch (err: unknown) {
        const error =
          err instanceof Error ? err.message : 'Envoi impossible';
        this.logger.warn(
          `[broadcast] failed phone=${phoneNumber}: ${error}`,
        );
        results.push({ phoneNumber, success: false, error });
      }

      if (i < phones.length - 1) {
        await this.delay(300);
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.length - sent;
    this.logger.log(
      `[broadcast] complete mode=${isTemplate ? 'template' : 'text'} sent=${sent} failed=${failed} total=${results.length}`,
    );

    return { sent, failed, results };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async markRead(conversationId: string): Promise<WhatsappConversation> {
    const conv = await this.conversationByIdOr404(conversationId);
    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_conversations')
      .update({ unread_count: 0, updated_at: now })
      .eq('id', conv.id)
      .select(
        'id, phone_number, contact_name, last_message_text, last_message_at, unread_count, status, source',
      )
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Mise à jour impossible',
      });
    }
    await this.notifications.markReadByConversationId(conv.id);
    return mapConversation(data as ConversationRow);
  }

  /** Traitement webhook Meta Cloud API (async, erreurs loguées). */
  async handleMetaWebhook(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(
      `[Meta handler] start object=${String(payload.object ?? '')}`,
    );

    try {
      if (payload.object !== 'whatsapp_business_account') {
        this.logger.warn(
          `[Meta handler] ignored — unexpected object="${String(payload.object ?? '')}" (expected whatsapp_business_account)`,
        );
        return;
      }

      const entries = Array.isArray(payload.entry) ? payload.entry : [];
      this.logger.log(`[Meta handler] entries count=${entries.length}`);

      if (entries.length === 0) {
        this.logger.warn('[Meta handler] no entries in payload');
      }

      for (let ei = 0; ei < entries.length; ei++) {
        const entry = entries[ei];
        if (!entry || typeof entry !== 'object') {
          this.logger.warn(`[Meta handler] entry[${ei}] skipped (invalid)`);
          continue;
        }
        const entryObj = entry as Record<string, unknown>;
        const changes = Array.isArray(entryObj.changes)
          ? (entryObj.changes as unknown[])
          : [];
        this.logger.log(
          `[Meta handler] entry[${ei}] id=${String(entryObj.id ?? '')} changes=${changes.length}`,
        );

        for (let ci = 0; ci < changes.length; ci++) {
          const change = changes[ci];
          if (!change || typeof change !== 'object') {
            this.logger.warn(
              `[Meta handler] entry[${ei}] change[${ci}] skipped (invalid)`,
            );
            continue;
          }
          const changeObj = change as Record<string, unknown>;
          const field = String(changeObj.field ?? '');
          const value = changeObj.value;
          this.logger.log(
            `[Meta handler] entry[${ei}] change[${ci}] field=${field} value=${value && typeof value === 'object' ? 'object' : 'missing'}`,
          );
          if (value && typeof value === 'object') {
            await this.processMetaWebhookValue(
              value as Record<string, unknown>,
              ei,
              ci,
            );
          }
        }
      }

      this.logger.log('[Meta handler] completed OK');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`[Meta handler] fatal error: ${message}`, stack);
      if (err && typeof err === 'object') {
        this.logger.error(
          `[Meta handler] error payload:\n${stringifyForLog(err)}`,
        );
      }
      throw err;
    }
  }

  private async processMetaWebhookValue(
    value: Record<string, unknown>,
    entryIndex: number,
    changeIndex: number,
  ): Promise<void> {
    const prefix = `[Meta value e${entryIndex}c${changeIndex}]`;
    const metadata =
      value.metadata && typeof value.metadata === 'object'
        ? (value.metadata as Record<string, unknown>)
        : null;
    if (metadata) {
      this.logger.log(
        `${prefix} metadata phone_number_id=${String(metadata.phone_number_id ?? '')} display=${String(metadata.display_phone_number ?? '')}`,
      );
    }

    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
    this.logger.log(`${prefix} statuses count=${statuses.length}`);
    for (const raw of statuses) {
      if (!raw || typeof raw !== 'object') continue;
      const st = raw as Record<string, unknown>;
      const messageId = pickStr(st, 'id');
      const status = pickStr(st, 'status');
      const errors = Array.isArray(st.errors) ? st.errors : [];
      const errorDetail =
        errors.length > 0 && errors[0] && typeof errors[0] === 'object'
          ? JSON.stringify(errors[0])
          : '';
      this.logger.log(
        `${prefix} status update messageId=${messageId} status=${status}${errorDetail ? ` error=${errorDetail}` : ''}`,
      );
      if (status.toLowerCase().includes('fail')) {
        this.logger.warn(
          `${prefix} delivery FAILED messageId=${messageId}${errorDetail ? ` — ${errorDetail}` : ''}`,
        );
      }
      if (messageId) {
        await this.updateMessageStatus(messageId, status);
      }
    }

    const messages = Array.isArray(value.messages) ? value.messages : [];
    this.logger.log(`${prefix} messages count=${messages.length}`);

    if (messages.length === 0) {
      this.logger.log(
        `${prefix} no messages in this change (status-only or empty)`,
      );
      return;
    }

    const contactNameByWaId = new Map<string, string>();
    const contacts = Array.isArray(value.contacts) ? value.contacts : [];
    for (const raw of contacts) {
      if (!raw || typeof raw !== 'object') continue;
      const contact = raw as Record<string, unknown>;
      const waId = pickStr(contact, 'wa_id');
      const profile =
        contact.profile && typeof contact.profile === 'object'
          ? (contact.profile as Record<string, unknown>)
          : null;
      const name = profile ? pickStr(profile, 'name') : '';
      if (waId && name) contactNameByWaId.set(waId, name);
    }
    this.logger.log(`${prefix} contacts mapped=${contactNameByWaId.size}`);

    for (let mi = 0; mi < messages.length; mi++) {
      const raw = messages[mi];
      if (!raw || typeof raw !== 'object') {
        this.logger.warn(`${prefix} message[${mi}] skipped (invalid)`);
        continue;
      }
      const msg = raw as Record<string, unknown>;
      const from = pickStr(msg, 'from');
      const phone = normalizePhoneNumber(from);
      const type = pickStr(msg, 'type') || 'text';

      let text = extractMetaMessageBody(msg);
      const metaMessageId = pickStr(msg, 'id');
      const sentAt =
        parseWebhookTimestamp(pickStr(msg, 'timestamp')) ??
        new Date().toISOString();

      let mediaUrl: string | null = null;
      let fileName: string | null = null;
      let fileSize: number | null = null;

      if (INBOUND_MEDIA_TYPES.has(type)) {
        const block = extractMetaMediaBlock(msg, type);
        fileName = block?.fileName || null;
        const mediaId = block?.mediaId || '';

        if (mediaId) {
          try {
            const ingested = await this.ingestInboundMetaMedia({
              type,
              mediaId,
              fileName,
              mimeType: block?.mimeType || '',
            });
            mediaUrl = ingested.mediaUrl;
            fileName = ingested.fileName;
            fileSize = ingested.fileSize;
            if (!text.trim()) {
              text =
                type === 'document'
                  ? fileName || 'Document'
                  : type === 'image'
                    ? 'Photo'
                    : type === 'video'
                      ? 'Vidéo'
                      : type === 'audio'
                        ? 'Audio'
                        : '';
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `${prefix} message[${mi}] media ingest failed type=${type} mediaId=${mediaId}: ${errMsg}`,
            );
            if (!text.trim()) text = MEDIA_UNAVAILABLE;
          }
        } else {
          this.logger.warn(
            `${prefix} message[${mi}] media type=${type} without media_id`,
          );
          if (!text.trim()) text = MEDIA_UNAVAILABLE;
        }
      }

      const preview = previewForConversation(type, text);

      // Meta reply context: { from, id: wamid of quoted message }
      const replyCtx = extractReplyContext(msg);
      const replyToWamid = replyCtx.wamid;

      if (replyToWamid) {
        this.logger.log(
          `${prefix} message[${mi}] HAS reply context id=${replyToWamid}`,
        );
      } else {
        // Help diagnose missing quotes: log keys + whether context exists
        this.logger.log(
          `${prefix} message[${mi}] no reply context — keys=${Object.keys(msg).join(',')} contextType=${typeof msg.context}`,
        );
        if (msg.context) {
          this.logger.log(
            `${prefix} message[${mi}] context raw=${JSON.stringify(msg.context).slice(0, 400)}`,
          );
        }
      }

      this.logger.log(
        `${prefix} parse message[${mi}] from=${from} phone=${phone} type=${type} metaId=${metaMessageId} replyTo=${replyToWamid || '(none)'} mediaUrl=${mediaUrl ? 'yes' : 'no'} body="${text.slice(0, 200)}${text.length > 200 ? '…' : ''}"`,
      );

      if (!phone) {
        this.logger.warn(
          `${prefix} message[${mi}] skipped — no phone (from="${from}")`,
        );
        continue;
      }

      const contactName = contactNameByWaId.get(from) || null;

      const conv = await this.findOrCreateConversation({
        phone,
        contactName,
        watiContactId: from || phone,
        watiConversationId: null,
        source: 'meta',
        lastMessageText: preview || null,
        lastMessageAt: sentAt,
        incrementUnread: true,
      });

      if (!metaMessageId && !text && !mediaUrl) {
        this.logger.warn(
          `${prefix} message[${mi}] skipped persist — no metaMessageId and empty body`,
        );
        continue;
      }

      let replyToPreview: string | null = null;
      let replyToAuthor: string | null = null;
      if (replyToWamid) {
        const quoted = await this.findMessageByWamid(replyToWamid);
        if (quoted) {
          const qType = String(quoted.type ?? 'text');
          const qBody = String(quoted.body ?? '');
          replyToPreview =
            qType === 'audio'
              ? 'Audio'
              : qType === 'image'
                ? 'Photo'
                : qType === 'video'
                  ? 'Vidéo'
                  : qType === 'document'
                    ? 'Document'
                    : qBody.trim().slice(0, 120) || 'Message';
          replyToAuthor =
            quoted.direction === 'outbound'
              ? 'Vous'
              : contactName?.trim() ||
                conv.contact_name?.trim() ||
                'Contact';
        } else {
          replyToPreview = 'Message';
          replyToAuthor = 'Vous';
        }
      }

      await this.persistMessage({
        conversationId: conv.id,
        direction: 'inbound',
        body: text,
        type,
        status: 'delivered',
        watiMessageId: metaMessageId || null,
        watiLocalId: null,
        sentAt,
        incrementUnread: false,
        replyToWatiMessageId: replyToWamid || null,
        replyToPreview,
        replyToAuthor,
        mediaUrl,
        fileName,
        fileSize,
      });

      try {
        await this.notifications.createWhatsappMessageNotification({
          conversationId: conv.id,
          phoneNumber: phone,
          contactName: conv.contact_name,
          body: preview,
          messageId: metaMessageId || null,
          createdAt: sentAt,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `${prefix} notification create failed conversationId=${conv.id}: ${message}`,
        );
      }
    }
  }

  private async updateMessageStatus(
    watiMessageId: string,
    statusRaw: string,
  ): Promise<void> {
    const status = mapMetaStatus(statusRaw);
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_messages')
      .update({ status })
      .eq('wati_message_id', watiMessageId)
      .select('id');

    if (error) {
      this.logger.error(
        `[Meta status] update failed metaId=${watiMessageId} status=${status} error=${formatSupabaseError(error)}`,
      );
      return;
    }
    const count = Array.isArray(data) ? data.length : 0;
    this.logger.log(
      `[Meta status] updated metaId=${watiMessageId} status=${status} rows=${count}`,
    );
  }

  private async conversationByIdOr404(id: string): Promise<ConversationRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      throw new NotFoundException({ message: 'conversation introuvable' });
    }
    return data as ConversationRow;
  }

  private async findOrCreateConversation(input: {
    phone: string;
    contactName: string | null;
    watiContactId: string;
    watiConversationId: string | null;
    source: string;
    lastMessageText: string | null;
    lastMessageAt: string;
    incrementUnread: boolean;
  }): Promise<ConversationRow> {
    this.logger.log(
      `[Supabase conversation] find phone=${input.phone} contactName=${input.contactName ?? ''} incrementUnread=${input.incrementUnread}`,
    );

    const sb = this.supabase.getClient();
    const { data: existing, error: findError } = await sb
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone_number', input.phone)
      .maybeSingle();

    if (findError) {
      this.logger.error(
        `[Supabase conversation] find error phone=${input.phone} ${formatSupabaseError(findError)}`,
      );
      throw new ConflictException({ message: findError.message });
    }

    const now = new Date().toISOString();

    if (existing) {
      this.logger.log(
        `[Supabase conversation] found existing id=${existing.id} unread=${existing.unread_count}`,
      );
      const unread = Number(existing.unread_count ?? 0);
      const patch = {
        contact_name: input.contactName || existing.contact_name,
        last_message_text: input.lastMessageText ?? existing.last_message_text,
        last_message_at: input.lastMessageAt,
        unread_count: input.incrementUnread ? unread + 1 : unread,
        wati_contact_id: input.watiContactId || existing.wati_contact_id,
        wati_conversation_id:
          input.watiConversationId || existing.wati_conversation_id,
        updated_at: now,
      };
      const { data, error } = await sb
        .from('whatsapp_conversations')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error || !data) {
        this.logger.error(
          `[Supabase conversation] update failed id=${existing.id} ${formatSupabaseError(error)}`,
        );
        throw new ConflictException({ message: error?.message ?? 'update conv' });
      }
      this.logger.log(
        `[Supabase conversation] updated id=${data.id} unread=${data.unread_count} last="${String(data.last_message_text ?? '').slice(0, 80)}"`,
      );
      return data as ConversationRow;
    }

    this.logger.log(`[Supabase conversation] creating new phone=${input.phone}`);
    const { data, error } = await sb
      .from('whatsapp_conversations')
      .insert({
        phone_number: input.phone,
        contact_name: input.contactName,
        last_message_text: input.lastMessageText,
        last_message_at: input.lastMessageAt,
        unread_count: input.incrementUnread ? 1 : 0,
        status: 'open',
        source: input.source,
        wati_contact_id: input.watiContactId,
        wati_conversation_id: input.watiConversationId,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error || !data) {
      this.logger.error(
        `[Supabase conversation] insert failed phone=${input.phone} ${formatSupabaseError(error)}`,
      );
      throw new ConflictException({
        message: error?.message ?? 'création conversation impossible',
      });
    }
    this.logger.log(
      `[Supabase conversation] created id=${data.id} phone=${data.phone_number}`,
    );
    return data as ConversationRow;
  }

  private async touchConversation(
    id: string,
    patch: {
      lastMessageText: string;
      lastMessageAt: string;
      contactName: string | null;
      watiContactId: string | null;
      watiConversationId: string | null;
    },
  ): Promise<void> {
    await this.supabase
      .getClient()
      .from('whatsapp_conversations')
      .update({
        last_message_text: patch.lastMessageText,
        last_message_at: patch.lastMessageAt,
        contact_name: patch.contactName,
        wati_contact_id: patch.watiContactId,
        wati_conversation_id: patch.watiConversationId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  private async findMessageByWamid(
    watiMessageId: string,
  ): Promise<MessageRow | null> {
    const id = watiMessageId.trim();
    if (!id) return null;
    const { data, error } = await this.supabase
      .getClient()
      .from('whatsapp_messages')
      .select(MESSAGE_SELECT)
      .eq('wati_message_id', id)
      .maybeSingle();
    if (error) {
      this.logger.warn(
        `findMessageByWamid failed: ${formatSupabaseError(error)}`,
      );
      return null;
    }
    return (data as MessageRow | null) ?? null;
  }

  /**
   * Meta media_id → download (Bearer) → Cloudinary → public URL for the chat UI.
   */
  private async ingestInboundMetaMedia(input: {
    type: string;
    mediaId: string;
    fileName?: string | null;
    mimeType?: string;
  }): Promise<{
    mediaUrl: string;
    fileName: string;
    fileSize: number | null;
  }> {
    const downloaded = await this.meta.downloadMedia(input.mediaId);
    const mimeType = input.mimeType?.trim() || downloaded.mimeType;
    const ext = extensionFromMime(mimeType, input.type);
    const fileName =
      input.fileName?.trim() ||
      `${input.type}-${input.mediaId.slice(-8)}.${ext}`;
    const resourceType = cloudinaryResourceTypeFor(input.type);

    const uploaded = await this.cloudinary.uploadWhatsAppInboundBuffer(
      downloaded.buffer,
      {
        resourceType,
        fileName,
        mimeType,
        folder: '63agency/whatsapp/inbound',
      },
    );

    this.logger.log(
      `[inbound media] type=${input.type} mediaId=${input.mediaId} → cloudinary ${uploaded.publicId}`,
    );

    return {
      mediaUrl: uploaded.secureUrl,
      fileName,
      fileSize: uploaded.bytes ?? downloaded.fileSize,
    };
  }

  private async persistMessage(input: {
    conversationId: string;
    direction: MessageDirection;
    body: string;
    type: string;
    status: string;
    watiMessageId: string | null;
    watiLocalId: string | null;
    sentAt: string;
    incrementUnread: boolean;
    replyToWatiMessageId?: string | null;
    replyToPreview?: string | null;
    replyToAuthor?: string | null;
    mediaUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
  }): Promise<WhatsappMessage> {
    this.logger.log(
      `[Supabase message] save conversationId=${input.conversationId} direction=${input.direction} metaId=${input.watiMessageId ?? ''} replyTo=${input.replyToWatiMessageId ?? ''} body="${input.body.slice(0, 120)}${input.body.length > 120 ? '…' : ''}"`,
    );

    const sb = this.supabase.getClient();
    const row: Record<string, unknown> = {
      conversation_id: input.conversationId,
      direction: input.direction,
      body: input.body,
      type: input.type,
      status: input.status,
      wati_message_id: input.watiMessageId,
      wati_local_id: input.watiLocalId,
      sent_at: input.sentAt,
      created_at: input.sentAt,
      reply_to_wati_message_id: input.replyToWatiMessageId ?? null,
      reply_to_preview: input.replyToPreview ?? null,
      reply_to_author: input.replyToAuthor ?? null,
    };

    if (input.mediaUrl !== undefined) {
      row.media_url = input.mediaUrl;
    }
    if (input.fileName !== undefined) {
      row.file_name = input.fileName;
    }
    if (input.fileSize !== undefined) {
      row.file_size = input.fileSize;
    }

    if (input.watiMessageId) {
      const { data, error } = await sb
        .from('whatsapp_messages')
        .upsert(row, { onConflict: 'wati_message_id' })
        .select(MESSAGE_SELECT)
        .single();
      if (!error && data) {
        this.logger.log(
          `[Supabase message] upsert OK id=${data.id} conversationId=${data.conversation_id}`,
        );
        return mapMessage(data as MessageRow);
      }
      if (error && !error.message.toLowerCase().includes('duplicate')) {
        this.logger.warn(
          `[Supabase message] upsert failed metaId=${input.watiMessageId} ${formatSupabaseError(error)} — fallback insert`,
        );
      } else if (error) {
        this.logger.log(
          `[Supabase message] upsert duplicate metaId=${input.watiMessageId} — fallback insert`,
        );
      }
    }

    const { data, error } = await sb
      .from('whatsapp_messages')
      .insert(row)
      .select(MESSAGE_SELECT)
      .single();

    if (error || !data) {
      this.logger.error(
        `[Supabase message] insert failed conversationId=${input.conversationId} ${formatSupabaseError(error)}`,
      );
      throw new ConflictException({
        message: error?.message ?? 'insert message impossible',
      });
    }
    this.logger.log(
      `[Supabase message] insert OK id=${data.id} conversationId=${data.conversation_id}`,
    );
    return mapMessage(data as MessageRow);
  }
}
