export const MEETING_STATUSES = [
  'scheduled',
  'done',
  'cancelled',
  'no_show',
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

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
  notes: string | null;
  meet_link: string | null;
  meet_space: string | null;
  created_at: string;
  updated_at: string;
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
  notes: string | null;
  meetLink: string | null;
  meetSpace: string | null;
  createdAt: string;
  updatedAt: string;
};
