export type AvailabilitySlot = {
  start: string;
  end: string;
};

export type AvailabilityDayRow = {
  id: string;
  user_id: string;
  date: string;
  timezone: string;
  slots: AvailabilitySlot[] | unknown;
  created_at: string;
  updated_at: string;
};

export type AvailabilityDay = {
  id: string;
  userId: string;
  date: string;
  timezone: string;
  slots: AvailabilitySlot[];
  createdAt: string;
  updatedAt: string;
};

function normalizeSlots(raw: unknown): AvailabilitySlot[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const start = String((item as { start?: unknown }).start ?? '').trim();
      const end = String((item as { end?: unknown }).end ?? '').trim();
      if (!start || !end) return null;
      return { start, end };
    })
    .filter((s): s is AvailabilitySlot => s != null);
}

export function mapAvailabilityDay(row: AvailabilityDayRow): AvailabilityDay {
  const dateRaw = String(row.date ?? '');
  const date = dateRaw.includes('T') ? dateRaw.slice(0, 10) : dateRaw;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    date,
    timezone: String(row.timezone ?? ''),
    slots: normalizeSlots(row.slots),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}
