import { DateTime } from 'luxon';

/** IANA zone — tracks Morocco's legal time (UTC+1 until 2026-09-20, then permanent UTC+0). */
export const CASABLANCA_TZ = 'Africa/Casablanca';

function toUtcDateTime(iso: string | Date): DateTime {
  return typeof iso === 'string'
    ? DateTime.fromISO(iso, { zone: 'utc' })
    : DateTime.fromJSDate(iso, { zone: 'utc' });
}

function toCasablanca(iso: string | Date): DateTime {
  const local = toUtcDateTime(iso).setZone(CASABLANCA_TZ);
  if (!local.isValid) {
    throw new Error(
      `conversion Africa/Casablanca impossible: ${local.invalidReason ?? 'unknown'}`,
    );
  }
  return local;
}

/**
 * Format meeting date + time in Africa/Casablanca (fr).
 * date → "25 juillet 2026"
 * time → "15h00"
 */
export function formatMeetingDate(iso: string | Date): {
  date: string;
  time: string;
} {
  const local = toCasablanca(iso).setLocale('fr');
  return {
    date: local.toFormat('d MMMM yyyy'),
    time: local.toFormat("HH'h'mm"),
  };
}

/** @deprecated use formatMeetingDate().date */
export function formatMeetingDateFr(iso: string | Date): string {
  return formatMeetingDate(iso).date;
}

/** @deprecated use formatMeetingDate().time */
export function formatMeetingTimeFr(iso: string | Date): string {
  return formatMeetingDate(iso).time;
}

/** True when meeting is in the future and strictly less than `hours` ahead. */
export function isMeetingWithinHours(
  iso: string | Date,
  hours: number,
): boolean {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diffMs = d.getTime() - Date.now();
  return diffMs >= 0 && diffMs < hours * 60 * 60 * 1000;
}

export function firstNameOnly(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** YYYY-MM-DD in Africa/Casablanca for a given instant. */
export function casablancaDateKeyFromIso(iso: string | Date): string {
  return toCasablanca(iso).toISODate()!;
}

/**
 * Convert a Casablanca local calendar date + time to a UTC Date
 * via IANA Africa/Casablanca (no hardcoded offset).
 */
function casablancaLocalToUtc(dateKey: string, time: string): Date {
  const dt = DateTime.fromISO(`${dateKey}T${time}`, {
    zone: CASABLANCA_TZ,
  });
  if (!dt.isValid) {
    throw new Error(
      `conversion Africa/Casablanca impossible: ${dt.invalidReason ?? 'unknown'}`,
    );
  }
  return dt.toUTC().toJSDate();
}

/** Start/end of "today" in Africa/Casablanca as UTC ISO strings (end exclusive). */
export function casablancaDayBounds(ref = new Date()): {
  startIso: string;
  endIso: string;
} {
  const start = toCasablanca(ref).startOf('day').toUTC();
  const end = start.plus({ days: 1 });
  return { startIso: start.toISO()!, endIso: end.toISO()! };
}

/** Monday 00:00 → next Monday 00:00 in Africa/Casablanca (end exclusive). */
export function casablancaWeekBounds(ref = new Date()): {
  startIso: string;
  endIso: string;
} {
  const local = toCasablanca(ref).startOf('day');
  // Luxon weekday: Monday = 1 … Sunday = 7
  const monday = local.minus({ days: local.weekday - 1 });
  const start = monday.toUTC();
  const end = monday.plus({ days: 7 }).toUTC();
  return { startIso: start.toISO()!, endIso: end.toISO()! };
}
