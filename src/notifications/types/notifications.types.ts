export type NotificationMeta = {
  conversationId?: string;
  phoneNumber?: string;
  messageId?: string;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
  meta: NotificationMeta;
};

export type NotificationsListResponse = {
  unreadCount: number;
  items: NotificationItem[];
};
