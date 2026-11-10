import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Vérifie X-Hub-Signature-256 Meta (HMAC-SHA256 du corps brut, préfixe sha256=).
 * Ne jamais re-stringifier le JSON — utiliser req.rawBody.
 */
export function verifyMetaWebhookSignature(
  signatureHeader: string | undefined,
  rawBody: Buffer,
  appSecret: string,
): boolean {
  if (!appSecret?.trim()) return false;
  if (!signatureHeader?.trim() || !rawBody || rawBody.length === 0) {
    return false;
  }

  const provided = signatureHeader.trim();
  const expected =
    'sha256=' +
    createHmac('sha256', appSecret.trim()).update(rawBody).digest('hex');

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
