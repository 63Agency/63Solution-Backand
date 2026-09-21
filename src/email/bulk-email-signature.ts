/**
 * Signature bulk = signature partagée (carte HTML).
 * Conservé pour compat imports existants (email.service.ts).
 */
import {
  emailSignatureHtml,
  emailSignatureText,
} from '../common/mailer/email-signature';

/** @deprecated Prefer emailSignatureHtml() — alias pour bulk. */
export const BULK_EMAIL_SIGNATURE = emailSignatureHtml();

export const BULK_EMAIL_SIGNATURE_TEXT = emailSignatureText();

/** Append shared signature to HTML body (after {{name}} replacement). */
export function appendBulkEmailSignature(htmlBody: string): string {
  const trimmed = htmlBody.trimEnd();
  return `${trimmed}${emailSignatureHtml()}`;
}
