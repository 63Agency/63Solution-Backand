const PHONE_FIELD_NAMES = new Set([
  'phone',
  'téléphone',
  'telephone',
  'phone number',
  'numéro de téléphone',
  'numero de telephone',
  'mobile',
]);

const EMAIL_FIELD_NAMES = new Set([
  'email',
  'e-mail',
  'mail',
  'courriel',
]);

function normFieldName(name: string): string {
  return name.trim().toLowerCase();
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function extractCustomFieldValue(field: Record<string, unknown>): string {
  const value = field.value;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return (
      pickStr(v, 'value', 'phone', 'email') ||
      (Array.isArray(v) ? v.map(String).join(', ') : '')
    );
  }
  return '';
}

export function extractPhoneFromCustomFields(
  fields: unknown[] | undefined,
): string | null {
  if (!Array.isArray(fields)) return null;
  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue;
    const field = raw as Record<string, unknown>;
    const name = normFieldName(pickStr(field, 'name'));
    if (!PHONE_FIELD_NAMES.has(name)) continue;
    const val = extractCustomFieldValue(field);
    if (val) return val;
  }
  return null;
}

export function extractEmailFromCustomFields(
  fields: unknown[] | undefined,
): string | null {
  if (!Array.isArray(fields)) return null;
  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue;
    const field = raw as Record<string, unknown>;
    const name = normFieldName(pickStr(field, 'name'));
    if (!EMAIL_FIELD_NAMES.has(name)) continue;
    const val = extractCustomFieldValue(field);
    if (val) return val;
  }
  return null;
}

function parseClickUpTimestamp(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const n = Number(raw);
    const ms = n > 1e12 ? n : n * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof raw === 'number') {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function mapClickUpTaskToLead(
  task: Record<string, unknown>,
  webhookPayload?: Record<string, unknown>,
): {
  id: string;
  name: string | null;
  status: string | null;
  listId: string | null;
  listName: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  clickupData: Record<string, unknown>;
} {
  const id = pickStr(task, 'id');
  const name = pickStr(task, 'name') || null;

  const statusObj = task.status;
  let status: string | null = null;
  if (statusObj && typeof statusObj === 'object') {
    status =
      pickStr(statusObj as Record<string, unknown>, 'status') ||
      pickStr(statusObj as Record<string, unknown>, 'name') ||
      null;
  } else if (typeof statusObj === 'string') {
    status = statusObj;
  }

  const list = task.list;
  let listId: string | null = null;
  let listName: string | null = null;
  if (list && typeof list === 'object') {
    const l = list as Record<string, unknown>;
    listId = pickStr(l, 'id') || null;
    listName = pickStr(l, 'name') || null;
  }

  const customFields = Array.isArray(task.custom_fields)
    ? task.custom_fields
    : undefined;

  const createdAt =
    parseClickUpTimestamp(task.date_created) ?? new Date().toISOString();
  const updatedAt =
    parseClickUpTimestamp(task.date_updated) ?? createdAt;

  return {
    id,
    name,
    status,
    listId,
    listName,
    phone: extractPhoneFromCustomFields(customFields),
    email: extractEmailFromCustomFields(customFields),
    createdAt,
    updatedAt,
    clickupData: {
      task,
      ...(webhookPayload ? { webhook: webhookPayload } : {}),
    },
  };
}
