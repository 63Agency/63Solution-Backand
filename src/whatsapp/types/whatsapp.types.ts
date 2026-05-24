export type MessageDirection = 'inbound' | 'outbound';

export type WhatsappConversation = {
  id: string;
  phoneNumber: string;
  contactName: string;
  lastMessageText: string;
  lastMessageAt: string | null;
  unreadCount: number;
  status: string;
  source: string;
};

export type WhatsappMessage = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  type: string;
  status: string;
  watiMessageId: string | null;
  createdAt: string;
};

export type WatiSendSessionResult = {
  ok: boolean;
  whatsappMessageId: string | null;
  watiLocalId: string | null;
  watiConversationId: string | null;
  text: string;
  status: string;
  sentAt: string | null;
};
