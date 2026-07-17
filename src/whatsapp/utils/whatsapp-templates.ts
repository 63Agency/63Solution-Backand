export type WhatsAppTemplate = {
  id: string;
  name: string;
  body: string;
  language?: string;
  type?: string;
  status?: string;
};

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Extract BODY text from Meta `components` array. */
function extractBodyFromMetaComponents(components: unknown): string {
  if (!Array.isArray(components)) return '';
  for (const c of components) {
    if (!c || typeof c !== 'object') continue;
    const comp = c as Record<string, unknown>;
    const type = String(comp.type ?? '').toUpperCase();
    if (type === 'BODY' && typeof comp.text === 'string') {
      return comp.text.trim();
    }
  }
  return '';
}

function extractTemplateBody(row: Record<string, unknown>): string {
  return (
    extractBodyFromMetaComponents(row.components) ||
    readString(row.body_content) ||
    readString(row.body) ||
    readString(row.bodyContent) ||
    readString(row.message) ||
    ''
  );
}

function extractTemplateName(row: Record<string, unknown>): string {
  return (
    readString(row.template_name) ??
    readString(row.name) ??
    readString(row.templateName) ??
    'Sans nom'
  );
}

function extractTemplateType(row: Record<string, unknown>): string | undefined {
  return (
    readString(row.template_type) ??
    readString(row.category) ??
    readString(row.template_category) ??
    readString(row.type)
  );
}

function extractTemplateId(
  row: Record<string, unknown>,
  index: number,
): string {
  const id =
    readString(row.id) ??
    readString(row.template_id) ??
    readString(row.templateId) ??
    extractTemplateName(row);
  return id || `template-${index}`;
}

export function isCustomWhatsAppTemplate(template: WhatsAppTemplate): boolean {
  const type = (template.type ?? '').toLowerCase();
  if (type.includes('system')) return false;
  return true;
}

function collectTemplateRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (!raw || typeof raw !== 'object') return [];

  const obj = raw as Record<string, unknown>;

  // Meta Cloud API: { data: [...] }
  const data = obj.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return [data];

  const message = obj.message;
  if (Array.isArray(message)) return message;
  if (message && typeof message === 'object') return [message];

  const templates = obj.templates;
  if (Array.isArray(templates)) return templates;

  return [];
}

export function normalizeWhatsAppTemplates(raw: unknown): WhatsAppTemplate[] {
  const rows = collectTemplateRows(raw);

  return rows.flatMap((row, index) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    const body = extractTemplateBody(r);
    const name = extractTemplateName(r);
    if (!body && name === 'Sans nom') return [];

    const template: WhatsAppTemplate = {
      id: extractTemplateId(r, index),
      name,
      body: body || name,
      language:
        readString(r.language) ??
        readString(r.locale) ??
        readString(r.language_code),
      type: extractTemplateType(r),
      status: readString(r.status),
    };

    return isCustomWhatsAppTemplate(template) ? [template] : [];
  });
}
