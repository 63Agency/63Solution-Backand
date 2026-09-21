/**
 * Signature email partagée (carte de visite HTML) — bulk + contact.
 * Compatible Gmail / Outlook : tables + CSS inline uniquement.
 *
 * Logo Cloudinary « 63 » carré : ABSENT du repo (seule image = ancienne
 * bannière saad-chahoubi-bulk.png). On rend un carré noir « 63 » en HTML.
 *
 * URLs sociales profil : ABSENTES du code (seulement des labels texte).
 * Rangée icônes non rendue tant qu’aucune URL n’est fournie.
 */

const CONTACT_PHONE_DISPLAY = '+212 6 06 67 67 10';
const CONTACT_PHONE_TEL = '+212606676710';
const CONTACT_EMAIL = 'contact@63agency.ma';
/** Site vitrine (présent dans cors-origins + contact templates). */
const CONTACT_WEBSITE_URL = 'https://www.63agency.com';
const CONTACT_WEBSITE_LABEL = '63agency.com';

/**
 * Social profile URLs found in codebase: NONE.
 * Labels only existed in contact-email.templates.ts ("LinkedIn · Instagram · Facebook").
 * Missing (do not invent): Facebook, X, LinkedIn, Instagram, TikTok, WhatsApp, YouTube, Google/Maps.
 */
export const EMAIL_SIGNATURE_SOCIAL_URLS: Record<string, string | null> = {
  facebook: null,
  x: null,
  linkedin: null,
  instagram: null,
  tiktok: null,
  whatsapp: null,
  youtube: null,
  googleMaps: null,
};

/** Petit logo « 63 » — carré noir, texte blanc (fallback HTML, pas d’URL Cloudinary dédiée). */
function logo63Cell(): string {
  return `
<td width="72" valign="top" style="padding:0 20px 0 0;vertical-align:top;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="64" height="64" style="border-collapse:collapse;width:64px;height:64px;background-color:#111111;border-radius:10px;">
    <tr>
      <td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background-color:#111111;border-radius:10px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.5px;line-height:64px;text-align:center;">
        63
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
 * Bloc signature HTML (carte blanche, coins arrondis).
 * Pas de grande image-signature ; pas de liens sociaux inventés.
 */
export function emailSignatureHtml(): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:600px;margin-top:28px;">
  <tr>
    <td style="padding:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;max-width:600px;background-color:#ffffff;border:1px solid #eeeeee;border-radius:12px;">
        <tr>
          <td style="padding:20px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">
              <tr>
                ${logo63Cell()}
                ${contactRowsHtml()}
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

/** Équivalent plain-text (multipart / clients sans HTML). */
export function emailSignatureText(): string {
  return `

--
Saad CHAHOUBI | Founder | 63 AGENCY
${CONTACT_PHONE_DISPLAY}
${CONTACT_EMAIL}
${CONTACT_WEBSITE_LABEL}`;
}
