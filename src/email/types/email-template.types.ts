export type EmailTemplateRow = {
  id: string;
  wa_template_name: string;
  subject: string;
  html_body: string;
  updated_at: string;
};

export type EmailTemplateMapping = {
  id: string;
  waTemplateName: string;
  subject: string;
  htmlBody: string;
  updatedAt: string;
};

export function mapEmailTemplateRow(row: EmailTemplateRow): EmailTemplateMapping {
  return {
    id: row.id,
    waTemplateName: row.wa_template_name,
    subject: row.subject,
    htmlBody: row.html_body,
    updatedAt: row.updated_at,
  };
}
