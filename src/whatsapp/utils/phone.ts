/** Numéro WhatsApp : chiffres uniquement (ex. 212612345678). */
export function normalizePhoneNumber(raw: string | undefined | null): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * Normalisation Maroc pour matching leads ↔ whatsapp_conversations.
 * Règles : strip non-digits → drop leading 00 → 0… → 212… → prefix 212 si ≤9 digits.
 */
export function toMoroccoWhatsappCandidate(
  raw: string | undefined | null,
): { candidate: string; last9: string } | null {
  let digits = normalizePhoneNumber(raw);
  if (!digits) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0')) {
    digits = `212${digits.slice(1)}`;
  }

  if (!digits.startsWith('212') && digits.length <= 9) {
    digits = `212${digits}`;
  }

  if (!digits) return null;

  const last9 = digits.length >= 9 ? digits.slice(-9) : digits;
  return { candidate: digits, last9 };
}
