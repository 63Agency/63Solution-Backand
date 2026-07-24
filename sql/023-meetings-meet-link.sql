-- Google Meet link per meeting.
-- Exécuter dans Supabase → SQL Editor.
-- (022 déjà utilisé pour ClickUp list source → numéro 023)

alter table public.meetings
  add column if not exists meet_link text;

alter table public.meetings
  add column if not exists meet_space text;
