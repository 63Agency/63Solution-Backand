import { DateTime, IANAZone } from 'luxon';

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True if `timezone` is a valid IANA zone (Luxon). */
export function isValidIanaTimezone(timezone: string): boolean {
  const tz = timezone.trim();
  if (!tz) return false;
  if (!IANAZone.isValidZone(tz)) return false;
  // Optional extra check when available — never reject a Luxon-valid zone
  // that Intl omits (Windows / older ICU sets).
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) {
      if (supported.includes(tz)) return true;
      // Luxon accepted it; still OK if ICU list is incomplete.
    }
  } catch {
    // Intl.supportedValuesOf may be unavailable.
  }
  return true;
}

export function isValidHhMm(value: string): boolean {
  return HH_MM.test(value.trim());
}

/**
 * Convert a local calendar date + HH:mm in `timezone` to a UTC Date.
 * Handles DST transitions via Luxon.
 */
export function localSlotToUtc(
  date: string,
  hhmm: string,
  timezone: string,
): Date {
  const dateKey = date.trim();
  const time = hhmm.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`date invalide: ${date}`);
  }
  if (!isValidHhMm(time)) {
    throw new Error(`heure invalide: ${hhmm}`);
  }
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`timezone invalide: ${timezone}`);
  }

  const dt = DateTime.fromISO(`${dateKey}T${time}`, {
    zone: timezone.trim(),
  });
  if (!dt.isValid) {
    throw new Error(
      `conversion timezone impossible: ${dt.invalidReason ?? 'unknown'}`,
    );
  }
  return dt.toUTC().toJSDate();
}

/** YYYY-MM-DD shifted by `deltaDays` (calendar arithmetic, no TZ). */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = DateTime.utc(y, m, d).plus({ days: deltaDays });
  return utc.toISODate()!;
}

/**
 * Local calendar date (YYYY-MM-DD) of a UTC instant in `timezone`.
 */
export function localDateKeyFromUtc(utcIso: string | Date, timezone: string): string {
  const dt =
    typeof utcIso === 'string'
      ? DateTime.fromISO(utcIso, { zone: 'utc' })
      : DateTime.fromJSDate(utcIso, { zone: 'utc' });
  const local = dt.setZone(timezone);
  if (!local.isValid) {
    throw new Error(`timezone invalide: ${timezone}`);
  }
  return local.toISODate()!;
}

/**
 * Strict containment: [meetingStart, meetingEnd] ⊆ [slotStart, slotEnd] (UTC ms).
 */
export function isIntervalContained(
  meetingStartUtc: Date,
  meetingEndUtc: Date,
  slotStartUtc: Date,
  slotEndUtc: Date,
): boolean {
  return (
    meetingStartUtc.getTime() >= slotStartUtc.getTime() &&
    meetingEndUtc.getTime() <= slotEndUtc.getTime()
  );
}
