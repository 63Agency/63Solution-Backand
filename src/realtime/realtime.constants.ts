/** Rooms socket.io (réutilisables WhatsApp / notifications). */
export const REALTIME_ROOMS = {
  LEADS: 'leads',
  WHATSAPP: 'whatsapp',
  NOTIFICATIONS: 'notifications',
  /** Présence employés — full admin uniquement. */
  PRESENCE: 'presence',
} as const;

export type RealtimeRoom =
  (typeof REALTIME_ROOMS)[keyof typeof REALTIME_ROOMS];

/** Events émis vers le front. */
export const REALTIME_EVENTS = {
  LEAD_CREATED: 'lead:created',
  LEAD_UPDATED: 'lead:updated',
  LEAD_DELETED: 'lead:deleted',
  MESSAGE_CREATED: 'message:created',
  MESSAGE_STATUS: 'message:status',
  CONVERSATION_UPDATED: 'conversation:updated',
  BROADCAST_PROGRESS: 'broadcast:progress',
  BROADCAST_DONE: 'broadcast:done',
  PRESENCE_UPDATE: 'presence:update',
  EMPLOYEE_CREATED: 'employee:created',
  EMPLOYEE_UPDATED: 'employee:updated',
  EMPLOYEE_DELETED: 'employee:deleted',
  PONG: 'pong',
} as const;
