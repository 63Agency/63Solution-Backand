import { normalizePhoneNumber } from '../../whatsapp/utils/phone';

/**
 * Normalize to Moroccan WhatsApp format: 212XXXXXXXXX.
 * Reuses digit stripping from the WhatsApp helper, then applies 212 prefix rules.
 */
export function normalizeMeetingPhone(
  raw: string | undefined | null,
): string | null {
  let digits = normalizePhoneNumber(raw);
  if (!digits) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('212')) {
    return digits;
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 9) {
    return `212${digits}`;
  }

  return digits;
}
