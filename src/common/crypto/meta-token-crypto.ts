import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

/**
 * Resolve META_TOKEN_ENC_KEY as a 32-byte Buffer.
 * Accepts hex (64 chars) or base64 (user asked base64; hex also OK like MAIL_ENC_KEY).
 */
function resolveMetaTokenEncKey(): Buffer {
  const raw = process.env.META_TOKEN_ENC_KEY?.trim() ?? '';
  if (!raw) {
    throw new Error(
      'META_TOKEN_ENC_KEY manquant dans .env (32 octets — openssl rand -base64 32).',
    );
  }

  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === KEY_LEN * 2) {
    return Buffer.from(raw, 'hex');
  }

  try {
    const fromB64 = Buffer.from(raw, 'base64');
    if (fromB64.length === KEY_LEN) {
      return fromB64;
    }
  } catch {
    // fall through
  }

  throw new Error(
    'META_TOKEN_ENC_KEY invalide : attendu 32 octets (base64 ou hex 64 chars).',
  );
}

/** Encrypt plaintext → base64 "iv:tag:ciphertext". */
export function encryptMetaToken(plain: string): string {
  const key = resolveMetaTokenEncKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plain), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** Decrypt base64 "iv:tag:ciphertext" → plaintext. */
export function decryptMetaToken(enc: string): string {
  const key = resolveMetaTokenEncKey();
  const parts = String(enc ?? '').split(':');
  if (parts.length !== 3) {
    throw new Error('meta token invalide (format iv:tag:ciphertext attendu).');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString('utf8');
}
