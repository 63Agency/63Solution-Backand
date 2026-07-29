import {
  REMINDER_CHANNELS,
  REMINDER_OFFSETS,
  type MeetingReminderRow,
  type MeetingRemindersConfig,
  type MeetingRemindersStatus,
  type ReminderChannel,
  type ReminderChannelFlags,
  type ReminderJobStatus,
  type ReminderOffset,
} from '../types/meeting.types';

const ALL_TRUE: ReminderChannelFlags = {
  '2d': true,
  '24h': true,
  '2h': true,
};

const OFFSET_MS: Record<ReminderOffset, number> = {
  '2d': 2 * 24 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
};

export function defaultRemindersConfig(): MeetingRemindersConfig {
  return {
    whatsapp: { ...ALL_TRUE },
    email: { ...ALL_TRUE },
  };
}

function normalizeFlags(
  raw: Partial<ReminderChannelFlags> | null | undefined,
  fallback: ReminderChannelFlags,
): ReminderChannelFlags {
  return {
    '2d': raw?.['2d'] ?? fallback['2d'],
    '24h': raw?.['24h'] ?? fallback['24h'],
    '2h': raw?.['2h'] ?? fallback['2h'],
  };
}

/** Normalize API/DB reminders; omitted channels default to all true. */
export function normalizeRemindersConfig(
  raw:
    | {
        whatsapp?: Partial<ReminderChannelFlags> | null;
        email?: Partial<ReminderChannelFlags> | null;
      }
    | null
    | undefined,
): MeetingRemindersConfig {
  const defaults = defaultRemindersConfig();
  if (!raw || typeof raw !== 'object') return defaults;
  return {
    whatsapp: normalizeFlags(raw.whatsapp, defaults.whatsapp),
    email: normalizeFlags(raw.email, defaults.email),
  };
}

export function computeSendAt(
  meetingDateIso: string,
  offset: ReminderOffset,
): Date {
  const meetingMs = new Date(meetingDateIso).getTime();
  return new Date(meetingMs - OFFSET_MS[offset]);
}

export function emptyRemindersStatus(): MeetingRemindersStatus {
  return {
    whatsapp: { '2d': 'skipped', '24h': 'skipped', '2h': 'skipped' },
    email: { '2d': 'skipped', '24h': 'skipped', '2h': 'skipped' },
  };
}

export function buildRemindersStatusFromJobs(
  jobs: MeetingReminderRow[],
  config: MeetingRemindersConfig,
): MeetingRemindersStatus {
  const status = emptyRemindersStatus();

  for (const channel of REMINDER_CHANNELS) {
    for (const offset of REMINDER_OFFSETS) {
      if (!config[channel][offset]) {
        status[channel][offset] = 'skipped';
      }
    }
  }

  for (const job of jobs) {
    const channel = job.channel as ReminderChannel;
    const offset = job.reminder_offset as ReminderOffset;
    if (!REMINDER_CHANNELS.includes(channel)) continue;
    if (!REMINDER_OFFSETS.includes(offset)) continue;
    const s = String(job.status) as ReminderJobStatus;
    status[channel][offset] = s;
  }

  return status;
}

export function legacyFlagsFromStatus(status: MeetingRemindersStatus): {
  reminderWhatsappSent: boolean;
  reminderEmailSent: boolean;
} {
  return {
    reminderWhatsappSent: REMINDER_OFFSETS.some(
      (o) => status.whatsapp[o] === 'sent',
    ),
    reminderEmailSent: REMINDER_OFFSETS.some(
      (o) => status.email[o] === 'sent',
    ),
  };
}

export { REMINDER_CHANNELS, REMINDER_OFFSETS, OFFSET_MS };
