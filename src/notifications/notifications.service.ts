import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  NotificationItem,
  NotificationMeta,
  NotificationsListResponse,
} from './types/notifications.types';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  meta: Record<string, unknown> | null;
  created_at: string;
};

function mapNotification(row: NotificationRow): NotificationItem {
  const metaRaw = row.meta ?? {};
  const meta: NotificationMeta = {
    conversationId:
      typeof metaRaw.conversationId === 'string'
        ? metaRaw.conversationId
        : undefined,
    phoneNumber:
      typeof metaRaw.phoneNumber === 'string' ? metaRaw.phoneNumber : undefined,
    messageId:
      typeof metaRaw.messageId === 'string' ? metaRaw.messageId : undefined,
  };
  return {
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    body: String(row.body),
    href: String(row.href),
    createdAt: String(row.created_at),
    read: Boolean(row.read),
    meta,
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async list(limit = 50): Promise<NotificationsListResponse> {
    const take = Math.min(Math.max(limit, 1), 200);
    const sb = this.supabase.getClient();

    const [{ count, error: countError }, { data, error }] = await Promise.all([
      sb
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false),
      sb
        .from('notifications')
        .select('id, type, title, body, href, read, meta, created_at')
        .order('created_at', { ascending: false })
        .limit(take),
    ]);

    if (countError) {
      throw new ConflictException({ message: countError.message });
    }
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      unreadCount: count ?? 0,
      items: (data ?? []).map((r) => mapNotification(r as NotificationRow)),
    };
  }

  async markRead(id: string): Promise<NotificationItem> {
    const { data, error } = await this.supabase
      .getClient()
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .select('id, type, title, body, href, read, meta, created_at')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'notification introuvable' });
    }
    return mapNotification(data as NotificationRow);
  }

  async markAllRead(): Promise<{ ok: true; marked: number }> {
    const { data, error } = await this.supabase
      .getClient()
      .from('notifications')
      .update({ read: true })
      .eq('read', false)
      .select('id');

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return { ok: true, marked: Array.isArray(data) ? data.length : 0 };
  }

  async markReadByConversationId(conversationId: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('notifications')
      .update({ read: true })
      .eq('read', false)
      .eq('type', 'whatsapp.message')
      .contains('meta', { conversationId });

    if (error) {
      this.logger.warn(
        `markReadByConversationId failed conversationId=${conversationId}: ${error.message}`,
      );
    }
  }

  async createWhatsappMessageNotification(input: {
    conversationId: string;
    phoneNumber: string;
    contactName: string | null;
    body: string;
    messageId: string | null;
    createdAt: string;
  }): Promise<void> {
    const title =
      input.contactName?.trim() || input.phoneNumber || 'WhatsApp';
    const body = input.body.trim() || '[message]';
    const href = `/dashboard/conversations?c=${input.conversationId}`;
    const meta: NotificationMeta = {
      conversationId: input.conversationId,
      phoneNumber: input.phoneNumber,
      ...(input.messageId ? { messageId: input.messageId } : {}),
    };

    const { error } = await this.supabase.getClient().from('notifications').insert({
      type: 'whatsapp.message',
      title,
      body,
      href,
      read: false,
      meta,
      created_at: input.createdAt,
    });

    if (error) {
      throw new ConflictException({ message: error.message });
    }
  }
}
