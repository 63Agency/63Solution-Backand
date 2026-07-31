export type BlockedDayRow = {
  id: string;
  date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type BlockedDay = {
  id: string;
  date: string;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
};

export function mapBlockedDay(row: BlockedDayRow): BlockedDay {
  const dateRaw = String(row.date ?? '');
  const date = dateRaw.includes('T') ? dateRaw.slice(0, 10) : dateRaw;
  return {
    id: String(row.id),
    date,
    reason: row.reason ? String(row.reason) : null,
    createdAt: String(row.created_at),
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}
