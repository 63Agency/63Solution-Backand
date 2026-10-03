-- Composite indexes for commission / by-member stats (setter|closer + meeting_date range).
-- setter_id / closer_id single-column indexes already in 046.
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/047-meetings-setter-closer-date-idx.sql

create index if not exists meetings_setter_meeting_date_idx
  on public.meetings (setter_id, meeting_date)
  where setter_id is not null;

create index if not exists meetings_closer_meeting_date_idx
  on public.meetings (closer_id, meeting_date)
  where closer_id is not null;
