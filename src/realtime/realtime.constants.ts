/** Rooms socket.io (réutilisables WhatsApp / notifications). */
export const REALTIME_ROOMS = {
  LEADS: 'leads',
  WHATSAPP: 'whatsapp',
  NOTIFICATIONS: 'notifications',
} as const;

export type RealtimeRoom =
  (typeof REALTIME_ROOMS)[keyof typeof REALTIME_ROOMS];

/** Events émis vers le front. */
export const REALTIME_EVENTS = {
  LEAD_CREATED: 'lead:created',
  LEAD_UPDATED: 'lead:updated',
  PONG: 'pong',
} as const;
