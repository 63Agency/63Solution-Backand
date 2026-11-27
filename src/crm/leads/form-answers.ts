/**
 * Normalise les custom fields ClickUp → { q, a }[] pour le front CRM.
 * name / phone / email / source restent hors de cette liste (colonnes clickup_leads).
 */

export type LeadFormAnswer = { q: string; a: string };

const SKIP_FIELD_NAMES = new Set([
  'name',
  'nom',
  'full name',
  'fullname',
  'phone',
  'téléphone',
  'telephone',
  'phone number',
  'numéro de téléphone',
  'numero de telephone',
  'mobile',
  'email',
  'e-mail',
  'mail',
  'courriel',
  'contact_email',
  'contact email',
  'contactemail',
  'email professionnel',
  'email personnel',
  'e mail',
  'source',
  'lead source',
  'origine',
]);

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

function looksLikeSkippedIdentity(name: string): boolean {
  if (SKIP_FIELD_NAMES.has(name)) return true;
  if (name.includes('email') || name.includes('e-mail') || name.includes('courriel')) {
    return true;
  }
  if (name.includes('phone') || name.includes('téléphone') || name.includes('telephone')) {
    return true;
  }
  if (/(^|[^a-z])mail([^a-z]|$)/.test(name)) return true;
  return false;
}

function resolveDropdownLabel(
  field: Record<string, unknown>,
  value: unknown,
): string {
  const typeConfig = field.type_config;
  if (!typeConfig || typeof typeConfig !== 'object') return '';
  const options = (typeConfig as Record<string, unknown>).options;
  if (!Array.isArray(options)) return '';

  const match = options.find((opt) => {
    if (!opt || typeof opt !== 'object') return false;
    const o = opt as Record<string, unknown>;
    if (o.id != null && String(o.id) === String(value)) return true;
    if (o.orderindex != null && String(o.orderindex) === String(value)) return true;
    return false;
  });
  if (!match || typeof match !== 'object') return '';
  return pickStr(match as Record<string, unknown>, 'name', 'label', 'value');
}

function formatFieldValue(field: Record<string, unknown>): string {
  const value = field.value;
  if (value == null || value === '') return '';

  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number') return String(item);
        if (item && typeof item === 'object') {
          return (
            pickStr(item as Record<string, unknown>, 'name', 'label', 'value', 'email') ||
            ''
          );
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return (
      pickStr(v, 'value', 'name', 'label', 'phone', 'email', 'url') ||
      resolveDropdownLabel(field, (v as { id?: unknown }).id ?? value)
    );
  }

  // drop_down / labels souvent stockés comme orderindex numérique
  const type = pickStr(field, 'type').toLowerCase();
  if (type === 'drop_down' || type === 'labels' || type === 'enum') {
    return resolveDropdownLabel(field, value);
  }

  return String(value);
}

function customFieldsFromClickupData(
  clickupData: Record<string, unknown> | null | undefined,
): unknown[] {
  if (!clickupData || typeof clickupData !== 'object') return [];
  const task = clickupData.task;
  if (task && typeof task === 'object') {
    const fields = (task as Record<string, unknown>).custom_fields;
    if (Array.isArray(fields)) return fields;
  }
  const top = clickupData.custom_fields;
  return Array.isArray(top) ? top : [];
}

/**
 * Extrait les réponses formulaire Ads / custom fields (hors name/phone/email/source).
 */
export function extractFormAnswers(
  clickupData: Record<string, unknown> | null | undefined,
): LeadFormAnswer[] {
  const fields = customFieldsFromClickupData(clickupData);
  const out: LeadFormAnswer[] = [];

  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue;
    const field = raw as Record<string, unknown>;
    const q = pickStr(field, 'name', 'label');
    if (!q) continue;
    if (looksLikeSkippedIdentity(normName(q))) continue;

    let a = formatFieldValue(field);
    if (!a) {
      const type = pickStr(field, 'type').toLowerCase();
      if (type === 'drop_down' || type === 'labels' || type === 'enum') {
        a = resolveDropdownLabel(field, field.value);
      }
    }
    if (!a) continue;
    out.push({ q, a });
  }

  return out;
}

/** Lit source / company / created_by depuis clickup_data (leads manuels). */
export function readManualMeta(clickupData: Record<string, unknown> | null | undefined): {
  source: string | null;
  company: string | null;
  createdBy: string | null;
} {
  if (!clickupData || typeof clickupData !== 'object') {
    return { source: null, company: null, createdBy: null };
  }
  const source =
    typeof clickupData.source === 'string' && clickupData.source.trim()
      ? clickupData.source.trim()
      : null;
  const company =
    typeof clickupData.company === 'string' && clickupData.company.trim()
      ? clickupData.company.trim()
      : null;
  const createdBy =
    typeof clickupData.created_by === 'string' && clickupData.created_by.trim()
      ? clickupData.created_by.trim()
      : null;
  return { source, company, createdBy };
}
