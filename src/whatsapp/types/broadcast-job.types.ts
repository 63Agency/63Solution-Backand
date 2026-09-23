export const BROADCAST_JOB_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export type BroadcastJobStatus = (typeof BROADCAST_JOB_STATUSES)[number];

export type BroadcastChannels = {
  whatsapp: boolean;
  email: boolean;
};

export type BroadcastMessageConfig = {
  templateName?: string;
  templateLanguage: string;
  /** true = recipients objects with per-row variable1/name */
  personalized?: boolean;
  variable1?: string;
  components?: Array<{
    type: string;
    parameters: Array<{ type: string; text: string }>;
  }>;
};

export type BroadcastEmailConfig = {
  subject: string;
  html: string;
};

/** Entrée stockée dans phone_numbers jsonb (rétrocompat string | objet). */
export type BroadcastRecipientStored = {
  phoneNumber?: string;
  email?: string;
  name?: string;
  variable1?: string;
};

export type BroadcastJobRow = {
  id: string;
  created_by: string | null;
  status: string;
  message_config: BroadcastMessageConfig | unknown;
  phone_numbers: unknown;
  channels?: BroadcastChannels | unknown;
  email_config?: BroadcastEmailConfig | unknown | null;
  total: number;
  /** Compteurs WhatsApp (legacy column names). */
  sent: number;
  failed: number;
  email_sent?: number | null;
  email_failed?: number | null;
  cursor_index: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type BroadcastJobResultRow = {
  id: string;
  job_id: string;
  phone_number: string | null;
  email?: string | null;
  name?: string | null;
  recipient_key?: string | null;
  success: boolean;
  conversation_id: string | null;
  message_id: string | null;
  error: string | null;
  wa_success?: boolean | null;
  wa_error?: string | null;
  email_success?: boolean | null;
  email_error?: string | null;
  email_message_id?: string | null;
  created_at: string;
};

export type BroadcastJobListItem = {
  id: string;
  status: BroadcastJobStatus;
  total: number;
  /** WA counters (alias sent/failed). */
  waSent: number;
  waFailed: number;
  emailSent: number;
  emailFailed: number;
  channels: BroadcastChannels;
  createdBy: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type BroadcastJobDetail = {
  id: string;
  status: BroadcastJobStatus;
  total: number;
  waSent: number;
  waFailed: number;
  emailSent: number;
  emailFailed: number;
  channels: BroadcastChannels;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  messageConfig: BroadcastMessageConfig;
  emailConfig: BroadcastEmailConfig | null;
  createdBy: string | null;
};

export type BroadcastJobResultItem = {
  phoneNumber: string | null;
  email: string | null;
  name: string | null;
  waSuccess: boolean | null;
  waError: string | null;
  emailSuccess: boolean | null;
  emailError: string | null;
  conversationId: string | null;
  messageId: string | null;
  emailMessageId: string | null;
  createdAt: string;
  /** Legacy alias = waSuccess */
  success: boolean;
  error: string | null;
};

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

export function parseChannels(raw: unknown): BroadcastChannels {
  const cfg = parseJsonField<Record<string, unknown>>(raw, {});
  const whatsapp = cfg.whatsapp !== false;
  const email = cfg.email === true;
  return { whatsapp, email };
}

export function parseEmailConfig(raw: unknown): BroadcastEmailConfig | null {
  if (raw == null) return null;
  const cfg = parseJsonField<Record<string, unknown>>(raw, {});
  const subject = String(cfg.subject ?? '').trim();
  const html = String(cfg.html ?? '').trim();
  if (!subject || !html) return null;
  return { subject, html };
}

/**
 * Lit phone_numbers jsonb rétrocompatible :
 * - string[]
 * - [{ phoneNumber?, email?, name?, variable1? }]
 */
export function parseBroadcastRecipients(
  raw: unknown,
): BroadcastRecipientStored[] {
  const arr = parseJsonField<unknown[]>(raw, []);
  if (!Array.isArray(arr)) return [];

  const out: BroadcastRecipientStored[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const phoneNumber = item.trim();
      if (phoneNumber) out.push({ phoneNumber });
      continue;
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const phoneNumber = String(
        obj.phoneNumber ?? obj.phone ?? '',
      ).trim();
      const email = String(obj.email ?? '')
        .trim()
        .toLowerCase();
      const name =
        typeof obj.name === 'string' && obj.name.trim()
          ? obj.name.trim()
          : undefined;
      const variable1 =
        typeof obj.variable1 === 'string' && obj.variable1.trim()
          ? obj.variable1.trim()
          : undefined;
      if (!phoneNumber && !email) continue;
      out.push({
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(variable1 ? { variable1 } : {}),
      });
    }
  }
  return out;
}

export function parseMessageConfig(raw: unknown): BroadcastMessageConfig {
  const cfg = parseJsonField<Record<string, unknown>>(raw, {});
  return {
    templateName: String(cfg.templateName ?? '').trim() || undefined,
    templateLanguage: String(cfg.templateLanguage ?? 'fr').trim() || 'fr',
    personalized: cfg.personalized === true,
    variable1:
      typeof cfg.variable1 === 'string' && cfg.variable1.trim()
        ? cfg.variable1.trim()
        : undefined,
    components: Array.isArray(cfg.components)
      ? (cfg.components as BroadcastMessageConfig['components'])
      : undefined,
  };
}

export function buildRecipientKey(r: {
  phoneNumber?: string | null;
  email?: string | null;
}): string {
  const phone = (r.phoneNumber ?? '').trim();
  const email = (r.email ?? '').trim().toLowerCase();
  if (phone && email) return `${phone}|${email}`;
  if (phone) return phone;
  if (email) return `e:${email}`;
  return 'unknown';
}

export function mapJobListItem(row: BroadcastJobRow): BroadcastJobListItem {
  return {
    id: String(row.id),
    status: String(row.status) as BroadcastJobStatus,
    total: Number(row.total ?? 0),
    waSent: Number(row.sent ?? 0),
    waFailed: Number(row.failed ?? 0),
    emailSent: Number(row.email_sent ?? 0),
    emailFailed: Number(row.email_failed ?? 0),
    channels: parseChannels(row.channels),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at ?? ''),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  };
}

export function mapJobDetail(row: BroadcastJobRow): BroadcastJobDetail {
  return {
    id: String(row.id),
    status: String(row.status) as BroadcastJobStatus,
    total: Number(row.total ?? 0),
    waSent: Number(row.sent ?? 0),
    waFailed: Number(row.failed ?? 0),
    emailSent: Number(row.email_sent ?? 0),
    emailFailed: Number(row.email_failed ?? 0),
    channels: parseChannels(row.channels),
    createdAt: String(row.created_at ?? ''),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    error: row.error ? String(row.error) : null,
    messageConfig: parseMessageConfig(row.message_config),
    emailConfig: parseEmailConfig(row.email_config),
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}

export function mapJobResult(row: BroadcastJobResultRow): BroadcastJobResultItem {
  const waSuccess =
    row.wa_success != null ? Boolean(row.wa_success) : Boolean(row.success);
  const waError =
    row.wa_error != null
      ? String(row.wa_error)
      : row.error
        ? String(row.error)
        : null;

  return {
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    email: row.email ? String(row.email) : null,
    name: row.name ? String(row.name) : null,
    waSuccess: row.wa_success == null && row.email_success != null && !row.phone_number
      ? null
      : waSuccess,
    waError,
    emailSuccess:
      row.email_success == null ? null : Boolean(row.email_success),
    emailError: row.email_error ? String(row.email_error) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    messageId: row.message_id ? String(row.message_id) : null,
    emailMessageId: row.email_message_id
      ? String(row.email_message_id)
      : null,
    createdAt: String(row.created_at ?? ''),
    success: waSuccess,
    error: waError,
  };
}
