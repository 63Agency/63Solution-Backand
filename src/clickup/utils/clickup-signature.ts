import { Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

const debugLogger = new Logger('ClickUpSignature');

function normalizeProvidedSignature(signature: string): string {
  const trimmed = signature.trim();
  const withoutPrefix = trimmed.toLowerCase().startsWith('sha256=')
    ? trimmed.slice(7).trim()
    : trimmed;
  return withoutPrefix.toLowerCase();
}

/**
 * Vérifie X-Signature ClickUp (HMAC-SHA256 hex du corps brut).
 * @param rawBody Buffer exact des octets reçus — ne jamais re-stringifier JSON.parse.
 */
export function verifyClickUpSignature(
  signature: string | undefined,
  rawBody: Buffer,
  secret: string,
): boolean {
  if (!secret?.trim()) return true;
  if (!signature?.trim() || !rawBody || rawBody.length === 0) return false;

  const expected = createHmac('sha256', secret.trim())
    .update(rawBody)
    .digest('hex')
    .toLowerCase();

  const provided = normalizeProvidedSignature(signature);

  if (process.env.CLICKUP_WEBHOOK_DEBUG === '1') {
    debugLogger.debug(
      `rawBodyLength=${rawBody.length} header=${signature.trim()} expected=${expected} provided=${provided} match=${provided === expected}`,
    );
  }

  try {
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
