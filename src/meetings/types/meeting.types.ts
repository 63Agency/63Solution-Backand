export const MEETING_STATUSES = [
  'scheduled',
  'confirmed',
  'bon_qualified',
  'done',
  'cancelled',
  'no_show',
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** Jobs auto + envois manuels : gardés pour ces statuts. */
export const ACTIVE_REMINDER_STATUSES: readonly MeetingStatus[] = [
  'scheduled',
  'confirmed',
  'bon_qualified',
] as const;

export const MEETING_STATUS_LABEL =
  'scheduled | confirmed | bon_qualified | done | cancelled | no_show';

export function keepsReminderJobs(status: string): boolean {
  return (ACTIVE_REMINDER_STATUSES as readonly string[]).includes(status);
}
export const REMINDER_OFFSETS = ['2d', '24h', '2h'] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

export const REMINDER_CHANNELS = ['whatsapp', 'email'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_JOB_STATUSES = [
  'pending',
  'sent',
  'skipped',
  'failed',
] as const;
export type ReminderJobStatus = (typeof REMINDER_JOB_STATUSES)[number];

export type ReminderChannelFlags = {
  '2d': boolean;
  '24h': boolean;
  '2h': boolean;
};

export type MeetingRemindersConfig = {
  whatsapp: ReminderChannelFlags;
  email: ReminderChannelFlags;
};

export type ReminderChannelStatus = {
  '2d': ReminderJobStatus;
  '24h': ReminderJobStatus;
  '2h': ReminderJobStatus;
};

export type MeetingRemindersStatus = {
  whatsapp: ReminderChannelStatus;
  email: ReminderChannelStatus;
};

export type MeetingMember = {
  /** Id lead ClickUp (text), pas un user interne. */
  leadId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
};

export type MeetingMemberRow = {
  id: string;
  meeting_id: string;
  lead_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  created_at?: string;
};

/** Staff interne autorisé à voir le RDV (≠ members clients). */
export type MeetingAssignee = {
  userId: string;
  prenom: string;
  nom: string;
  email: string;
  role: string;
};

export type MeetingAssigneeRow = {
  meeting_id: string;
  user_id: string;
  created_at?: string;
};

export type MeetingRow = {
  id: string;
  lead_id: string | null;
  title: string;
  meeting_date: string;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  status: string;
  reminder_whatsapp_sent: boolean;
  reminder_email_sent: boolean;
  reminders?: MeetingRemindersConfig | null;
  manual_reminder_sent_at?: string | null;
  manual_reminder_whatsapp_sent?: boolean;
  manual_reminder_email_sent?: boolean;
  notes: string | null;
  meet_link: string | null;
  meet_space: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type MeetingReminderRow = {
  id: string;
  meeting_id: string;
  channel: string;
  reminder_offset: string;
  enabled: boolean;
  send_at: string;
  status: string;
  sent_at: string | null;
  error: string | null;
};

export type Meeting = {
  id: string;
  leadId: string | null;
  title: string;
  meetingDate: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  /** Participants côté client (autres leads) — distinct du contact principal. */
  members: MeetingMember[];
  /** IDs users internes (visibilité calendrier). */
  assignedUserIds: string[];
  /** Détail staff assigné (≠ members). */
  assignees: MeetingAssignee[];
  createdBy: string | null;
  status: MeetingStatus;
  reminderWhatsappSent: boolean;
  reminderEmailSent: boolean;
  reminders: MeetingRemindersConfig;
  remindersStatus: MeetingRemindersStatus;
  manualReminderSentAt: string | null;
  manualReminderWhatsappSent: boolean;
  manualReminderEmailSent: boolean;
  notes: string | null;
  meetLink: string | null;
  meetSpace: string | null;
  createdAt: string;
  updatedAt: string;
  /** Présent si notifyOnCreate a été demandé à la création. */
  notificationSent?: {
    whatsapp: boolean;
    email: boolean;
    whatsappError?: string | null;
    emailError?: string | null;
  };
};
