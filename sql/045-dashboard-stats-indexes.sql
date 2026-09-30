-- Indexes for dashboard aggregations (meetings by-day Casa + WhatsApp unread).
-- Safe to re-run (IF NOT EXISTS).

-- Already have meetings_meeting_date_idx ; expression index helps GROUP BY Casa day.
create index if not exists meetings_meeting_date_casa_day_idx
  on public.meetings (
    ((meeting_date at time zone 'Africa/Casablanca')::date)
  );

create index if not exists whatsapp_conversations_unread_positive_idx
  on public.whatsapp_conversations (unread_count)
  where unread_count > 0;
