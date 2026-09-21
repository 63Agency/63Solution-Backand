/**
 * Signature email partagée (bulk + contact).
 * Tables + CSS inline (Gmail / Outlook).
 *
 * Logo « 63 » : carré noir HTML (pas d’asset Cloudinary dédié dans le repo).
 * Sociaux sous le logo : WhatsApp, Facebook, Instagram.
 */

const CONTACT_PHONE_DISPLAY = '+212 6 06 67 67 10';
const CONTACT_PHONE_TEL = '+212606676710';
const CONTACT_EMAIL = 'contact@63agency.ma';
const CONTACT_WEBSITE_URL = 'https://www.63agency.com';
const CONTACT_WEBSITE_LABEL = '63agency.com';

/**
 * Liens sociaux (homepage 63agency.com, mars 2026).
 * Facebook : absente du site → icône sans lien profil.
 */
const SOCIAL = {
  whatsapp: 'https://wa.me/212720007007',
  instagram: 'https://www.instagram.com/',
  facebook: null as string | null,
} as const;

/** Icônes PNG (Icons8 CDN) — plus fiables que SVG dans Gmail/Outlook. */
const ICON_PNG = {
  whatsapp: 'https://img.icons8.com/color/48/whatsapp--v1.png',
  facebook: 'https://img.icons8.com/color/48/facebook-new.png',
  instagram: 'https://img.icons8.com/color/48/instagram-new--v1.png',
} as const;
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

/** Colonne gauche : logo 63 + 3 icônes sociales en dessous. */
function logoAndSocialsCell(): string {
  return `
<td width="80" valign="top" style="padding:0 18px 0 0;vertical-align:top;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:0 0 10px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="64" height="64" style="border-collapse:collapse;width:64px;height:64px;background-color:#111111;border-radius:10px;">
          <tr>
            <td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background-color:#111111;border-radius:10px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.5px;line-height:64px;text-align:center;">
              63
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto;">
          <tr>
            ${socialIconCell(SOCIAL.whatsapp, ICON_PNG.whatsapp, 'WhatsApp')}
            ${socialIconCell(SOCIAL.facebook, ICON_PNG.facebook, 'Facebook')}
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
 * Signature sans fond ni cadre — logo + textes + icônes sous le logo.
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
