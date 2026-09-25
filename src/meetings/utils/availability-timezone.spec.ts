import {
  isIntervalContained,
  isValidHhMm,
  isValidIanaTimezone,
  localDateKeyFromUtc,
  localSlotToUtc,
  shiftDateKey,
} from './availability-timezone';

describe('availability-timezone', () => {
  describe('isValidIanaTimezone', () => {
    it('accepts common IANA zones', () => {
      expect(isValidIanaTimezone('Africa/Casablanca')).toBe(true);
      expect(isValidIanaTimezone('Asia/Ho_Chi_Minh')).toBe(true);
      expect(isValidIanaTimezone('America/New_York')).toBe(true);
    });

    it('rejects garbage', () => {
      expect(isValidIanaTimezone('')).toBe(false);
      expect(isValidIanaTimezone('Not/A_Zone')).toBe(false);
    });
  });

  describe('isValidHhMm', () => {
    it('validates HH:mm', () => {
      expect(isValidHhMm('09:00')).toBe(true);
      expect(isValidHhMm('23:59')).toBe(true);
      expect(isValidHhMm('24:00')).toBe(false);
      expect(isValidHhMm('9:00')).toBe(false);
    });
  });

  describe('localSlotToUtc — Morocco (Africa/Casablanca IANA)', () => {
    it('pre-2026-09-20: local was UTC+1', () => {
      const utc = localSlotToUtc('2026-07-15', '15:00', 'Africa/Casablanca');
      expect(utc.toISOString()).toBe('2026-07-15T14:00:00.000Z');
    });

    it('post-2026-09-20: permanent UTC+0 when Node tzdb ≥ 2026c', () => {
      const tz = process.versions.tz ?? '';
      const m = /^(\d{4})([a-z])$/i.exec(tz);
      const has2026c =
        m != null &&
        (Number(m[1]) > 2026 || (Number(m[1]) === 2026 && m[2].toLowerCase() >= 'c'));
      if (!has2026c) {
        // Node 22.13 ships tz 2024b — skip until runtime is upgraded (e.g. ≥22.23.3).
        return;
      }
      const utc = localSlotToUtc('2026-09-25', '15:00', 'Africa/Casablanca');
      expect(utc.toISOString()).toBe('2026-09-25T15:00:00.000Z');
    });
  });

  describe('localSlotToUtc — Vietnam (UTC+07, no DST)', () => {
    it('converts Ho Chi Minh local to UTC', () => {
      const utc = localSlotToUtc('2026-03-10', '09:00', 'Asia/Ho_Chi_Minh');
      expect(utc.toISOString()).toBe('2026-03-10T02:00:00.000Z');
    });
  });

  describe('localSlotToUtc — USA DST (America/New_York)', () => {
    it('uses EST (UTC-5) in winter', () => {
      const utc = localSlotToUtc('2026-01-15', '10:00', 'America/New_York');
      expect(utc.toISOString()).toBe('2026-01-15T15:00:00.000Z');
    });

    it('uses EDT (UTC-4) in summer', () => {
      const utc = localSlotToUtc('2026-07-15', '10:00', 'America/New_York');
      expect(utc.toISOString()).toBe('2026-07-15T14:00:00.000Z');
    });
  });

  describe('isIntervalContained', () => {
    it('requires strict subset (inclusive edges)', () => {
      const slotStart = new Date('2026-07-15T14:00:00.000Z');
      const slotEnd = new Date('2026-07-15T16:00:00.000Z');
      const meetingStart = new Date('2026-07-15T14:00:00.000Z');
      const meetingEnd = new Date('2026-07-15T14:30:00.000Z');
      expect(
        isIntervalContained(meetingStart, meetingEnd, slotStart, slotEnd),
      ).toBe(true);

      const overflowEnd = new Date('2026-07-15T16:01:00.000Z');
      expect(
        isIntervalContained(meetingStart, overflowEnd, slotStart, slotEnd),
      ).toBe(false);
    });
  });

  describe('shiftDateKey / localDateKeyFromUtc', () => {
    it('shifts calendar dates', () => {
      expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
      expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('resolves local date in Vietnam from UTC', () => {
      // 2026-03-10 22:00 UTC = 2026-03-11 05:00 Ho Chi Minh
      const key = localDateKeyFromUtc(
        '2026-03-10T22:00:00.000Z',
        'Asia/Ho_Chi_Minh',
      );
      expect(key).toBe('2026-03-11');
    });
  });
});
