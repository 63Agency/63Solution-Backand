export const BROADCAST_JOB_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export type BroadcastJobStatus = (typeof BROADCAST_JOB_STATUSES)[number];

export type BroadcastMessageConfig = {
  templateName: string;
  templateLanguage: string;
  /** true = phone_numbers is [{phoneNumber, variable1?}] */
  personalized?: boolean;
  variable1?: string;
  components?: Array<{
    type: string;
    parameters: Array<{ type: string; text: string }>;
  }>;
};

/** Entrée stockée dans phone_numbers jsonb (string legacy ou objet perso). */
export type BroadcastRecipientStored = {
  phoneNumber: string;
  /** Absent / vide → worker utilise "Client" en mode personalized. */
  variable1?: string;
};

export type BroadcastJobRow = {
  id: string;
  created_by: string | null;
  status: string;
  message_config: BroadcastMessageConfig | unknown;
  /** string[] (global) OU BroadcastRecipientStored[] (personalized). */
  phone_numbers: unknown;
  total: number;
  sent: number;
  failed: number;
  cursor_index: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type BroadcastJobResultRow = {
  id: string;
  job_id: string;
  phone_number: string;
  success: boolean;
  conversation_id: string | null;
  message_id: string | null;
  error: string | null;
  created_at: string;
};

export type BroadcastJobListItem = {
  id: string;
  status: BroadcastJobStatus;
  total: number;
  sent: number;
  failed: number;
  createdBy: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type BroadcastJobDetail = {
  id: string;
  status: BroadcastJobStatus;
  total: number;
  sent: number;
  failed: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  messageConfig: BroadcastMessageConfig;
  createdBy: string | null;
};

export type BroadcastJobResultItem = {
  phoneNumber: string;
  success: boolean;
  error: string | null;
  conversationId: string | null;
  messageId: string | null;
  createdAt: string;
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

export function parsePhoneNumbers(raw: unknown): string[] {
  return parseBroadcastRecipients(raw).map((r) => r.phoneNumber);
}

/**
 * Lit phone_numbers jsonb rétrocompatible :
 * - string[] (jobs globaux / legacy)
 * - [{ phoneNumber, variable1? }] (mode personnalisé)
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
      if (!phoneNumber) continue;
      const v1 =
        typeof obj.variable1 === 'string' && obj.variable1.trim()
          ? obj.variable1.trim()
          : undefined;
      out.push({ phoneNumber, variable1: v1 });
    }
  }
  return out;
}

export function parseMessageConfig(raw: unknown): BroadcastMessageConfig {
  const cfg = parseJsonField<Record<string, unknown>>(raw, {});
  return {
    templateName: String(cfg.templateName ?? '').trim(),
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

export function mapJobListItem(row: BroadcastJobRow): BroadcastJobListItem {
  return {
    id: String(row.id),
    status: String(row.status) as BroadcastJobStatus,
    total: Number(row.total ?? 0),
    sent: Number(row.sent ?? 0),
    failed: Number(row.failed ?? 0),
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
    sent: Number(row.sent ?? 0),
    failed: Number(row.failed ?? 0),
    createdAt: String(row.created_at ?? ''),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    error: row.error ? String(row.error) : null,
    messageConfig: parseMessageConfig(row.message_config),
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}

export function mapJobResult(row: BroadcastJobResultRow): BroadcastJobResultItem {
  return {
    phoneNumber: String(row.phone_number ?? ''),
    success: Boolean(row.success),
    error: row.error ? String(row.error) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    messageId: row.message_id ? String(row.message_id) : null,
    createdAt: String(row.created_at ?? ''),
  };
}
