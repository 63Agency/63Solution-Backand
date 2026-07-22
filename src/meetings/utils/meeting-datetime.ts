const TZ = 'Africa/Casablanca';

/** e.g. "15 août 2026" */
export function formatMeetingDateFr(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** e.g. "14h30" */
export function formatMeetingTimeFr(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}h${minute}`;
}

export function firstNameOnly(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** YYYY-MM-DD in Africa/Casablanca for a given instant. */
function casablancaDateKey(ref: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ref);
}

/**
 * Convert a Casablanca local calendar date + time to a UTC Date.
 * Morocco observes UTC+01:00 year-round (no DST since 2018).
 */
function casablancaLocalToUtc(dateKey: string, time: string): Date {
  return new Date(`${dateKey}T${time}+01:00`);
}

/** Start/end of "today" in Africa/Casablanca as UTC ISO strings. */
export function casablancaDayBounds(ref = new Date()): {
  startIso: string;
  endIso: string;
} {
  const dateKey = casablancaDateKey(ref);
  const start = casablancaLocalToUtc(dateKey, '00:00:00');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Monday 00:00 → next Monday 00:00 in Africa/Casablanca. */
export function casablancaWeekBounds(ref = new Date()): {
  startIso: string;
  endIso: string;
} {
  const dateKey = casablancaDateKey(ref);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(ref);

  const offsetByWeekday: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const daysFromMonday = offsetByWeekday[weekday] ?? 0;

  const [y, m, d] = dateKey.split('-').map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d));
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  const mondayKey = `${monday.getUTCFullYear()}-${String(
    monday.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;

  const start = casablancaLocalToUtc(mondayKey, '00:00:00');
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
