/**
 * Bulk email signature image — uploaded from docs/assests/Saâd CHAHOUBI.png
 * Cloudinary: email-signatures/saad-chahoubi-bulk (1584×396)
 * Re-upload after changing the source file.
 */
const BULK_EMAIL_SIGNATURE_IMAGE_URL =
  'https://res.cloudinary.com/dtxrsmnub/image/upload/w_600,q_auto,f_auto/v1788002378/email-signatures/saad-chahoubi-bulk.png';

/**
 * Fixed HTML footer appended to every /email/broadcast message.
 * Image only — no extra background wrapper (Gmail / Outlook).
 */
export const BULK_EMAIL_SIGNATURE = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:28px;">
  <tr>
    <td align="left" style="padding:0;font-size:0;line-height:0;">
      <img src="${BULK_EMAIL_SIGNATURE_IMAGE_URL}" alt="Sa&acirc;d CHAHOUBI — 63 Agency" width="600" style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:600px;height:auto;" />
    </td>
  </tr>
</table>`;

/** Plain-text equivalent for multipart emails. */
export const BULK_EMAIL_SIGNATURE_TEXT = `

--
Saâd CHAHOUBI | Fondateur
Contact@63agency.ma
+212 6 06 67 67 10
www.63agency.ma`;

/** Append bulk signature to HTML body (after {{name}} replacement). */
export function appendBulkEmailSignature(htmlBody: string): string {
  const trimmed = htmlBody.trimEnd();
  return `${trimmed}${BULK_EMAIL_SIGNATURE}`;
}
