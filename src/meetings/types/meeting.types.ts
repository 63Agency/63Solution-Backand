export const MEETING_STATUSES = [
  'scheduled',
  'done',
  'cancelled',
  'no_show',
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

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
};
