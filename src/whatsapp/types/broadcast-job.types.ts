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
  variable1?: string;
  components?: Array<{
    type: string;
    parameters: Array<{ type: string; text: string }>;
  }>;
};

export type BroadcastJobRow = {
  id: string;
  created_by: string | null;
  status: string;
  message_config: BroadcastMessageConfig | unknown;
  phone_numbers: string[] | unknown;
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
  const arr = parseJsonField<unknown[]>(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => String(p ?? '').trim()).filter(Boolean);
}

export function parseMessageConfig(raw: unknown): BroadcastMessageConfig {
  const cfg = parseJsonField<Record<string, unknown>>(raw, {});
  return {
    templateName: String(cfg.templateName ?? '').trim(),
    templateLanguage: String(cfg.templateLanguage ?? 'fr').trim() || 'fr',
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
