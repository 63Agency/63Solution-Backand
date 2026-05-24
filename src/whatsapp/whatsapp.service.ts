import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import type {
  MessageDirection,
  WhatsappConversation,
  WhatsappMessage,
} from './types/whatsapp.types';
import { mapMetaStatus, MetaService } from './meta.service';
import { normalizePhoneNumber } from './utils/phone';

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
};

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function extractMetaMessageBody(msg: Record<string, unknown>): string {
  const type = pickStr(msg, 'type');
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
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    direction: row.direction as MessageDirection,
    body: String(row.body ?? ''),
    type: String(row.type ?? 'text'),
    status: String(row.status ?? 'sent'),
    watiMessageId: row.wati_message_id ? String(row.wati_message_id) : null,
    createdAt: String(row.sent_at ?? row.created_at),
  };
}

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
  ) {}

  verifyMetaWebhook(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    return this.meta.verifyWebhook(mode, token, challenge);
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
        'id, conversation_id, direction, body, type, status, wati_message_id, sent_at, created_at',
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
    const sent = await this.meta.sendTextMessage(
      conv.phone_number,
      dto.text.trim(),
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
    return mapConversation(data as ConversationRow);
  }

  /** Traitement webhook Meta Cloud API (async, erreurs loguées). */
  async handleMetaWebhook(payload: Record<string, unknown>): Promise<void> {
    if (payload.object !== 'whatsapp_business_account') {
      this.logger.debug(
        `Webhook Meta ignoré (object=${String(payload.object ?? '')})`,
      );
      return;
    }

    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const changes = Array.isArray((entry as Record<string, unknown>).changes)
        ? ((entry as Record<string, unknown>).changes as unknown[])
        : [];
      for (const change of changes) {
        if (!change || typeof change !== 'object') continue;
        const value = (change as Record<string, unknown>).value;
        if (value && typeof value === 'object') {
          await this.processMetaWebhookValue(value as Record<string, unknown>);
        }
      }
    }
  }

  private async processMetaWebhookValue(
    value: Record<string, unknown>,
  ): Promise<void> {
    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
    for (const raw of statuses) {
      if (!raw || typeof raw !== 'object') continue;
      const st = raw as Record<string, unknown>;
      const messageId = pickStr(st, 'id');
      const status = pickStr(st, 'status');
      if (messageId) {
        await this.updateMessageStatus(messageId, status);
      }
    }

    const messages = Array.isArray(value.messages) ? value.messages : [];
    if (messages.length === 0) return;

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

    for (const raw of messages) {
      if (!raw || typeof raw !== 'object') continue;
      const msg = raw as Record<string, unknown>;
      const from = pickStr(msg, 'from');
      const phone = normalizePhoneNumber(from);
      if (!phone) continue;

      const type = pickStr(msg, 'type') || 'text';
      const text = extractMetaMessageBody(msg);
      const metaMessageId = pickStr(msg, 'id');
      const sentAt =
        parseWebhookTimestamp(pickStr(msg, 'timestamp')) ??
        new Date().toISOString();

      const conv = await this.findOrCreateConversation({
        phone,
        contactName: contactNameByWaId.get(from) || null,
        watiContactId: from || phone,
        watiConversationId: null,
        source: 'meta',
        lastMessageText: text || null,
        lastMessageAt: sentAt,
        incrementUnread: true,
      });

      if (metaMessageId || text) {
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
        });
      }
    }
  }

  private async updateMessageStatus(
    watiMessageId: string,
    statusRaw: string,
  ): Promise<void> {
    const status = mapMetaStatus(statusRaw);
    const { error } = await this.supabase
      .getClient()
      .from('whatsapp_messages')
      .update({ status })
      .eq('wati_message_id', watiMessageId);
    if (error) {
      this.logger.warn(`Maj statut message Meta: ${error.message}`);
    }
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
    const sb = this.supabase.getClient();
    const { data: existing } = await sb
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone_number', input.phone)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing) {
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
        throw new ConflictException({ message: error?.message ?? 'update conv' });
      }
      return data as ConversationRow;
    }

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
      throw new ConflictException({
        message: error?.message ?? 'création conversation impossible',
      });
    }
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
  }): Promise<WhatsappMessage> {
    const sb = this.supabase.getClient();
    const row = {
      conversation_id: input.conversationId,
      direction: input.direction,
      body: input.body,
      type: input.type,
      status: input.status,
      wati_message_id: input.watiMessageId,
      wati_local_id: input.watiLocalId,
      sent_at: input.sentAt,
      created_at: input.sentAt,
    };

    if (input.watiMessageId) {
      const { data, error } = await sb
        .from('whatsapp_messages')
        .upsert(row, { onConflict: 'wati_message_id' })
        .select(
          'id, conversation_id, direction, body, type, status, wati_message_id, sent_at, created_at',
        )
        .single();
      if (!error && data) return mapMessage(data as MessageRow);
      if (error && !error.message.toLowerCase().includes('duplicate')) {
        this.logger.warn(`upsert message: ${error.message}`);
      }
    }

    const { data, error } = await sb
      .from('whatsapp_messages')
      .insert(row)
      .select(
        'id, conversation_id, direction, body, type, status, wati_message_id, sent_at, created_at',
      )
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'insert message impossible',
      });
    }
    return mapMessage(data as MessageRow);
  }
}
