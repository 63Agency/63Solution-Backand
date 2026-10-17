import type {
  WhatsappConversation,
  WhatsappMessage,
} from '../../whatsapp/types/whatsapp.types';

export type { WhatsappConversation, WhatsappMessage };

/** GET /leads/:id/whatsapp-thread */
export type LeadWhatsappThreadResponse = {
  conversation: WhatsappConversation | null;
  messages: WhatsappMessage[];
};

export type EmailMessageDirection = 'outbound' | 'inbound';

/** Ligne public.email_messages (API camelCase, sans secret). */
export type LeadEmailMessage = {
  id: string;
  leadId: string;
  userId: string | null;
  direction: EmailMessageDirection;
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type LeadEmailRow = {
  id: string;
  lead_id: string;
  user_id: string | null;
  direction: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

export const EMAIL_MESSAGE_SELECT =
  'id, lead_id, user_id, direction, from_email, to_email, subject, body_html, body_text, message_id, in_reply_to, references_header, status, error, sent_at, created_at';
