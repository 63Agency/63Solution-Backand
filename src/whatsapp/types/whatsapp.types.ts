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
  /** Present when type is "audio" — Meta media id stored in body. */
  mediaId: string | null;
  /** Cloudinary / public HTTPS URL for image, video, document. */
  mediaUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  status: string;
  watiMessageId: string | null;
  /** Alias Meta (même valeur que watiMessageId). */
  metaMessageId: string | null;
  createdAt: string;
  /** Citation WhatsApp (réponse à un message). */
  replyTo: {
    id: string;
    body: string;
    authorLabel: string;
  } | null;
};

export type MetaSendMessageResult = {
  whatsappMessageId: string | null;
  text: string;
  status: string;
  sentAt: string | null;
};
