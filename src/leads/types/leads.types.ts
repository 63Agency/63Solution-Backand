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
