import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import { assertCanAccessLeads } from '../common/utils/access';
import { ClickupService } from '../clickup/clickup.service';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  MessageDirection,
  WhatsappConversation,
  WhatsappMessage,
} from '../whatsapp/types/whatsapp.types';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { toMoroccoWhatsappCandidate } from '../whatsapp/utils/phone';
import type { SendLeadWhatsappTemplateDto } from './dto/send-lead-whatsapp-template.dto';
import type { LeadWhatsappThreadResponse } from './types/leads.types';

type ConversationRow = {
  id: string;
  phone_number: string;
  contact_name: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  unread_count: number;
  status: string;
  source: string;
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

const CONVERSATION_SELECT =
  'id, phone_number, contact_name, last_message_text, last_message_at, unread_count, status, source';

const MESSAGE_SELECT =
  'id, conversation_id, direction, body, type, status, wati_message_id, sent_at, created_at, reply_to_wati_message_id, reply_to_preview, reply_to_author, media_url, file_name, file_size';

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

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly clickup: ClickupService,
    private readonly supabase: SupabaseService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Thread WhatsApp d’un lead (match phone → whatsapp_conversations).
   * Pas de conversation → { conversation: null, messages: [] }.
   */
  async getWhatsappThread(
    user: AppUser,
    id: string,
  ): Promise<LeadWhatsappThreadResponse> {
    assertCanAccessLeads(user);

    const { item: lead } = await this.clickup.getLeadById(user, id);
    const phoneNorm = toMoroccoWhatsappCandidate(lead.phone);

    if (!phoneNorm) {
      return { conversation: null, messages: [] };
    }

    const { candidate, last9 } = phoneNorm;
    const sb = this.supabase.getClient();

    const { data: convRows, error: convError } = await sb
      .from('whatsapp_conversations')
      .select(CONVERSATION_SELECT)
      .or(
        `phone_number.eq.${candidate},phone_number.like.%${last9}`,
      )
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);

    if (convError) {
      this.logger.warn(
        `getWhatsappThread conversation lookup failed lead=${lead.id}: ${convError.message}`,
      );
      throw new ConflictException({ message: convError.message });
    }

    const convRow = (convRows?.[0] as ConversationRow | undefined) ?? null;
    if (!convRow) {
      return { conversation: null, messages: [] };
    }

    const { data: msgRows, error: msgError } = await sb
      .from('whatsapp_messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', convRow.id)
      .order('sent_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (msgError) {
      this.logger.warn(
        `getWhatsappThread messages failed conv=${convRow.id}: ${msgError.message}`,
      );
      throw new ConflictException({ message: msgError.message });
    }

    return {
      conversation: mapConversation(convRow),
      messages: ((msgRows ?? []) as MessageRow[]).map(mapMessage),
    };
  }

  /**
   * Envoi template Meta au lead (phone) — réutilise sendBroadcastTemplateToPhone
   * (Meta + persist whatsapp_messages).
   */
  async sendWhatsappTemplate(
    user: AppUser,
    id: string,
    dto: SendLeadWhatsappTemplateDto,
  ): Promise<{ ok: true; message: WhatsappMessage }> {
    assertCanAccessLeads(user);

    const { item: lead } = await this.clickup.getLeadById(user, id);
    const phoneNorm = toMoroccoWhatsappCandidate(lead.phone);
    if (!phoneNorm?.candidate) {
      throw new BadRequestException({
        message: 'Ce lead n’a pas de numéro de téléphone WhatsApp.',
      });
    }

    const templateName = String(dto.templateName ?? '').trim();
    if (!templateName) {
      throw new BadRequestException({ message: 'templateName requis' });
    }

    const language = String(dto.language ?? 'fr').trim() || 'fr';
    const variables = (dto.variables ?? [])
      .map((v) => String(v ?? '').trim())
      .filter((t) => t.length > 0);

    const components =
      variables.length > 0
        ? [
            {
              type: 'body',
              parameters: variables.map((text) => ({ type: 'text', text })),
            },
          ]
        : undefined;

    const out = await this.whatsapp.sendBroadcastTemplateToPhone({
      phone: phoneNorm.candidate,
      templateName,
      templateLanguage: language,
      variable1: undefined,
      components,
    });

    this.logger.log(
      `Lead WA template sent lead=${lead.id} template=${templateName}/${language} messageId=${out.messageId}`,
    );

    return { ok: true, message: out.message };
  }
}
