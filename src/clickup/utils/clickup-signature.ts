import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyClickUpSignature(
  signature: string | undefined,
  rawBody: string,
  secret: string,
): boolean {
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  if (!secret?.trim()) return true;
  if (!signature?.trim() || !rawBody) return false;

  const expected = createHmac('sha256', secret.trim())
    .update(rawBody, 'utf8')
    .digest('hex');

  const provided = signature.trim().startsWith('sha256=')
    ? signature.trim().slice(7)
    : signature.trim();

  try {
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
