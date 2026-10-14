-- ID événement Google Calendar (events.insert) pour patch / delete.
-- meet_link / meet_space restent (lien Meet + legacy spaces.create).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/050-meetings-google-event-id.sql

alter table public.meetings
  add column if not exists google_event_id text null;

comment on column public.meetings.google_event_id is
  'Google Calendar event id (primary calendar of OAuth account). Used for events.patch / events.delete.';
