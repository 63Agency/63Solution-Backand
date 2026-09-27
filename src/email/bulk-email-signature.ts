/**
 * Signature bulk = signature partagée (carte HTML).
 * Conservé pour compat imports existants.
 * L’ajout effectif se fait dans BulkMailerService / MailerService (idempotent).
 */
import {
  appendEmailSignatureHtml,
  appendEmailSignatureText,
  emailSignatureHtml,
  emailSignatureText,
} from '../common/mailer/email-signature';

/** @deprecated Prefer emailSignatureHtml(). */
export function getBulkEmailSignatureHtml(): string {
  return emailSignatureHtml();
}

/** @deprecated Prefer emailSignatureText(). */
export function getBulkEmailSignatureText(): string {
  return emailSignatureText();
}

/** Append shared signature to HTML body (after {{name}} replacement). */
export function appendBulkEmailSignature(htmlBody: string): string {
  return appendEmailSignatureHtml(htmlBody);
}

export function appendBulkEmailSignatureText(textBody: string): string {
  return appendEmailSignatureText(textBody);
}
