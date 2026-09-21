/**
 * Signature email partagée (bulk + contact).
 * Tables + CSS inline (Gmail / Outlook).
 *
 * Logo : public/images/IMG_1260.JPEG (servi en static) ou EMAIL_SIGNATURE_LOGO_URL.
 * Sociaux sous le logo : WhatsApp, Facebook, Instagram.
 */

const CONTACT_PHONE_DISPLAY = '+212 6 06 67 67 10';
const CONTACT_PHONE_TEL = '+212606676710';
const CONTACT_EMAIL = 'contact@63agency.ma';
const CONTACT_WEBSITE_URL = 'https://www.63agency.com';
const CONTACT_WEBSITE_LABEL = '63agency.com';

/**
 * Liens sociaux (homepage 63agency.com).
 * Sous le logo : WhatsApp + Instagram uniquement.
 */
const SOCIAL = {
  whatsapp: 'https://wa.me/212720007007',
  instagram: 'https://www.instagram.com/',
} as const;

/** Icônes PNG (Icons8 CDN) — plus fiables que SVG dans Gmail/Outlook. */
const ICON_PNG = {
  whatsapp: 'https://img.icons8.com/color/48/whatsapp--v1.png',
  instagram: 'https://img.icons8.com/color/48/instagram-new--v1.png',
} as const;

/** Chemin static servi par Nest : /images/IMG_1260.JPEG */
const LOGO_STATIC_PATH = '/images/IMG_1260.JPEG';

/**
 * URL absolue obligatoire pour les clients mail.
 * Priorité : EMAIL_SIGNATURE_LOGO_URL → API_PUBLIC_URL + /images/…
 */
function resolveLogoUrl(): string {
  const explicit = process.env.EMAIL_SIGNATURE_LOGO_URL?.trim();
  if (explicit) return explicit;

  const base = (
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.PUBLIC_API_URL?.trim() ||
    'https://api.63agency.com'
  ).replace(/\/+$/, '');

  return `${base}${LOGO_STATIC_PATH}`;
}

function socialIconCell(
  href: string | null,
  src: string,
  alt: string,
): string {
  const img = `<img src="${src}" alt="${alt}" width="22" height="22" style="display:block;border:0;outline:none;text-decoration:none;width:22px;height:22px;" />`;
  if (!href) {
    return `<td style="padding:0 6px 0 0;vertical-align:middle;">${img}</td>`;
  }
  return `<td style="padding:0 6px 0 0;vertical-align:middle;"><a href="${href}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;border:0;">${img}</a></td>`;
}

/** Colonne gauche : logo image 63 + 3 icônes sociales en dessous. */
function logoAndSocialsCell(): string {
  const logoUrl = resolveLogoUrl();
  return `
<td width="80" valign="top" style="padding:0 18px 0 0;vertical-align:top;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:0 0 10px 0;">
        <img src="${logoUrl}" alt="63 Agency" width="64" height="64" style="display:block;border:0;outline:none;text-decoration:none;width:64px;height:64px;border-radius:10px;" />
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto;">
          <tr>
            ${socialIconCell(SOCIAL.whatsapp, ICON_PNG.whatsapp, 'WhatsApp')}
            ${socialIconCell(SOCIAL.instagram, ICON_PNG.instagram, 'Instagram')}
          </tr>
        </table>
      </td>
    </tr>
  </table>
</td>`.trim();
}

function contactRowsHtml(): string {
  return `
<td valign="top" style="padding:0;vertical-align:top;font-family:Arial,Helvetica,sans-serif;color:#111111;">
  <div style="font-size:16px;font-weight:700;line-height:1.3;color:#111111;">Saad CHAHOUBI</div>
  <div style="font-size:13px;font-weight:400;line-height:1.4;color:#555555;margin-top:2px;">Founder | 63 AGENCY</div>
  <div style="font-size:12px;line-height:1;color:#dddddd;margin:10px 0;border-top:1px solid #e5e5e5;height:1px;">&nbsp;</div>
  <div style="font-size:13px;line-height:1.7;color:#222222;">
    <a href="tel:${CONTACT_PHONE_TEL}" style="color:#222222;text-decoration:none;">&#128222;&nbsp; ${CONTACT_PHONE_DISPLAY}</a><br />
    <a href="mailto:${CONTACT_EMAIL}" style="color:#222222;text-decoration:none;">&#9993;&nbsp; ${CONTACT_EMAIL}</a><br />
    <a href="${CONTACT_WEBSITE_URL}" style="color:#222222;text-decoration:none;" target="_blank">&#127760;&nbsp; ${CONTACT_WEBSITE_LABEL}</a>
  </div>
</td>`.trim();
}

/**
 * Signature sans fond ni cadre — logo image + textes + icônes sous le logo.
 */
export function emailSignatureHtml(): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:600px;margin-top:28px;">
  <tr>
    <td style="padding:0;background:transparent;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:600px;background:transparent;border:0;">
        <tr>
          ${logoAndSocialsCell()}
          ${contactRowsHtml()}
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

export function emailSignatureText(): string {
  return `

--
Saad CHAHOUBI | Founder | 63 AGENCY
${CONTACT_PHONE_DISPLAY}
${CONTACT_EMAIL}
${CONTACT_WEBSITE_LABEL}
WhatsApp: ${SOCIAL.whatsapp}
Instagram: ${SOCIAL.instagram}`;
}
