import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

/**
 * Resolve MAIL_ENC_KEY as a 32-byte Buffer.
 * Accepts hex (64 chars) or base64.
 */
function resolveMailEncKey(): Buffer {
  const raw = process.env.MAIL_ENC_KEY?.trim() ?? '';
  if (!raw) {
    throw new Error(
      'MAIL_ENC_KEY manquant dans .env (32 octets — openssl rand -hex 32).',
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
    `MAIL_ENC_KEY invalide : attendu 32 octets (hex 64 chars ou base64), reçu longueur utilisable incorrecte.`,
  );
}

/**
 * Encrypt plaintext → base64 "iv:tag:ciphertext".
 */
export function encrypt(plain: string): string {
  const key = resolveMailEncKey();
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

/**
 * Decrypt base64 "iv:tag:ciphertext" → plaintext.
 */
export function decrypt(enc: string): string {
  const key = resolveMailEncKey();
  const parts = String(enc ?? '').split(':');
  if (parts.length !== 3) {
    throw new Error('password_enc invalide (format iv:tag:ciphertext attendu).');
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
