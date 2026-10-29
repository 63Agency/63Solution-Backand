export const PORTAL_LEAD_ACTIVITY_KINDS = [
  'received',
  'stage_change',
  'note',
  'reminder',
  'owner_change',
] as const;

export type PortalLeadActivityKind =
  (typeof PORTAL_LEAD_ACTIVITY_KINDS)[number];

/** Types de rappel (frontend TaskType / ScheduleLeadReminderInput.taskType). */
export const PORTAL_REMINDER_TASK_TYPES = [
  'appel',
  'rendez_vous',
  'whatsapp',
  'relance',
  'devis',
] as const;

export type PortalReminderTaskType =
  (typeof PORTAL_REMINDER_TASK_TYPES)[number];
