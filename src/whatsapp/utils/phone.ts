/** Numéro WhatsApp : chiffres uniquement (ex. 212612345678). */
export function normalizePhoneNumber(raw: string | undefined | null): string {
  return String(raw ?? '').replace(/\D/g, '');
}
