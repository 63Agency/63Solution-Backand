import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
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
    private readonly notifications: NotificationsService,
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
      this.logger.log(
        `${prefix} status update messageId=${messageId} status=${status}`,
      );
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
      const text = extractMetaMessageBody(msg);
      const metaMessageId = pickStr(msg, 'id');
      const sentAt =
        parseWebhookTimestamp(pickStr(msg, 'timestamp')) ??
        new Date().toISOString();

      this.logger.log(
        `${prefix} parse message[${mi}] from=${from} phone=${phone} type=${type} metaId=${metaMessageId} text="${text.slice(0, 200)}${text.length > 200 ? '…' : ''}"`,
      );

      if (!phone) {
        this.logger.warn(
          `${prefix} message[${mi}] skipped — no phone (from="${from}")`,
        );
        continue;
      }

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

      if (!metaMessageId && !text) {
        this.logger.warn(
          `${prefix} message[${mi}] skipped persist — no metaMessageId and empty body`,
        );
        continue;
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
      });

      try {
        await this.notifications.createWhatsappMessageNotification({
          conversationId: conv.id,
          phoneNumber: phone,
          contactName: conv.contact_name,
          body: text,
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
    this.logger.log(
      `[Supabase message] save conversationId=${input.conversationId} direction=${input.direction} metaId=${input.watiMessageId ?? ''} body="${input.body.slice(0, 120)}${input.body.length > 120 ? '…' : ''}"`,
    );

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
      .select(
        'id, conversation_id, direction, body, type, status, wati_message_id, sent_at, created_at',
      )
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
