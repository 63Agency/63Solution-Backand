import { DateTime } from 'luxon';
import {
  CASABLANCA_TZ,
  casablancaDateKeyFromIso,
  casablancaDayBounds,
  casablancaWeekBounds,
  formatMeetingDate,
} from './meeting-datetime';

/** Skip IANA post-2026-09-20 assertions when the Node ICU tzdb is older than 2026c. */
function hasMoroccoUtc0Tzdb(): boolean {
  const tz = process.versions.tz ?? '';
  // e.g. "2026c", "2027a" — require year >= 2026 and letter >= c for 2026
  const m = /^(\d{4})([a-z])$/i.exec(tz);
  if (!m) return false;
  const year = Number(m[1]);
  const letter = m[2].toLowerCase();
  if (year > 2026) return true;
  if (year < 2026) return false;
  return letter >= 'c';
}

describe('meeting-datetime (Africa/Casablanca via Luxon)', () => {
  it('exports the IANA zone constant', () => {
    expect(CASABLANCA_TZ).toBe('Africa/Casablanca');
  });

  it('casablancaDateKeyFromIso uses the Casablanca calendar day', () => {
    // 2026-07-15 23:30 UTC = 2026-07-16 00:30 Casablanca (still UTC+1 that day)
    expect(casablancaDateKeyFromIso('2026-07-15T23:30:00.000Z')).toBe(
      '2026-07-16',
    );
  });

  it('casablancaDayBounds: pre-2026-09-20 midnight is UTC-1h (UTC+1 legal time)', () => {
    const ref = new Date('2026-07-15T12:00:00.000Z');
    const { startIso, endIso } = casablancaDayBounds(ref);
    expect(startIso).toBe('2026-07-14T23:00:00.000Z');
    expect(endIso).toBe('2026-07-15T23:00:00.000Z');
  });

  it('casablancaWeekBounds: Monday→next Monday exclusive', () => {
    // Wednesday 2026-07-15 Casablanca
    const ref = new Date('2026-07-15T12:00:00.000Z');
    const { startIso, endIso } = casablancaWeekBounds(ref);
    expect(startIso).toBe('2026-07-12T23:00:00.000Z'); // Mon 00:00 Casa
    expect(endIso).toBe('2026-07-19T23:00:00.000Z');
  });

  it('formatMeetingDate renders fr wall-clock in Casablanca', () => {
    const { date, time } = formatMeetingDate('2026-07-15T14:00:00.000Z');
    // 14:00 UTC = 15:00 Casa under UTC+1
    expect(date).toMatch(/15 juillet 2026/i);
    expect(time).toBe('15h00');
  });

  describe('Morocco permanent UTC+0 (tzdb ≥ 2026c)', () => {
    const maybeIt = hasMoroccoUtc0Tzdb() ? it : it.skip;

    maybeIt(
      `day bounds on 2026-09-25 use UTC midnight (Node tz=${process.versions.tz})`,
      () => {
        const ref = new Date('2026-09-25T12:00:00.000Z');
        const { startIso, endIso } = casablancaDayBounds(ref);
        expect(startIso).toBe('2026-09-25T00:00:00.000Z');
        expect(endIso).toBe('2026-09-26T00:00:00.000Z');
      },
    );

    maybeIt('Luxon offset is 0 after the 2026-09-20 transition', () => {
      const local = DateTime.fromISO('2026-09-25T15:00', {
        zone: CASABLANCA_TZ,
      });
      expect(local.offset).toBe(0);
      expect(local.toUTC().toISO()).toBe('2026-09-25T15:00:00.000Z');
    });
  });
});
