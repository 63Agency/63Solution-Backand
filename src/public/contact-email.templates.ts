const LOGO_URL =
  'https://res.cloudinary.com/dtxrsmnub/image/upload/w_180,q_auto,f_auto/v1788002378/email-signatures/saad-chahoubi-bulk.png';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0] ?? fullName;
  return part || 'client';
}

/** Signature HTML (client + admin). */
export function contactEmailSignatureHtml(): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">
  <tr>
    <td style="padding-bottom:12px;">
      <img src="${LOGO_URL}" alt="63 Agency" width="180" style="display:block;border:0;max-width:180px;height:auto;" />
    </td>
  </tr>
  <tr>
    <td style="padding:0;line-height:1.5;">
      <strong>Saad CHAHOUBI</strong><br />
      Fondateur — 63 Agency<br />
      <a href="tel:+212606676710" style="color:#222;text-decoration:none;">+212 6 06 67 67 10</a><br />
      <a href="mailto:Contact@63agency.ma" style="color:#222;">Contact@63agency.ma</a><br />
      <a href="https://www.63agency.com" style="color:#222;">www.63agency.com</a><br />
      <span style="color:#666;">LinkedIn · Instagram · Facebook</span>
    </td>
  </tr>
</table>`.trim();
}

export function buildClientContactEmail(fullName: string): {
  subject: string;
  text: string;
  html: string;
} {
  const prenom = firstName(fullName);
  const subject = 'Votre demande a bien été reçue — 63 Agency';
  const text = [
    `Bonjour ${prenom},`,
    '',
    'Nous avons bien reçu votre demande.',
    'Un conseiller 63 Agency vous recontactera très bientôt.',
    '',
    '—',
    'Saad CHAHOUBI | Fondateur',
    'Contact@63agency.ma',
    '+212 6 06 67 67 10',
    'www.63agency.com',
  ].join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;">
  <p>Bonjour <strong>${escapeHtml(prenom)}</strong>,</p>
  <p>Nous avons bien reçu votre demande.</p>
  <p>Un conseiller 63 Agency vous recontactera très bientôt pour en discuter avec vous.</p>
  <p>À très bientôt,</p>
  ${contactEmailSignatureHtml()}
</div>`.trim();

  return { subject, text, html };
}

export function buildAdminContactEmail(details: {
  name: string;
  email: string;
  phone: string;
  role: string;
  objective: string;
  campaigns: string;
  sector: string;
  company?: string;
  employees?: string;
  city?: string;
  budget?: string;
  availability?: string;
  establishment?: string;
  message?: string;
}): { subject: string; text: string; html: string } {
  const rows: Array<[string, string]> = [
    ['Nom', details.name],
    ['Email', details.email],
    ['Téléphone', details.phone],
    ['Rôle', details.role],
    ['Objectif', details.objective],
    ['Campagnes', details.campaigns],
    ['Secteur', details.sector],
    ['Entreprise', details.company ?? ''],
    ['Employés', details.employees ?? ''],
    ['Ville', details.city ?? ''],
    ['Budget', details.budget ?? ''],
    ['Disponibilité', details.availability ?? ''],
    ['Établissement', details.establishment ?? ''],
    ['Message', details.message ?? ''],
  ].filter(([, v]) => Boolean(String(v).trim())) as Array<[string, string]>;

  const subject = `[63 Agency] Nouveau contact — ${details.name}`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#666;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 0;vertical-align:top;">${escapeHtml(v).replace(/\n/g, '<br/>')}</td></tr>`,
    )
    .join('');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;">
  <p><strong>Nouveau contact site vitrine</strong></p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    ${htmlRows}
  </table>
  ${contactEmailSignatureHtml()}
</div>`.trim();

  return { subject, text, html };
}
