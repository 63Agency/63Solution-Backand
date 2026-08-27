-- Nouveaux statuts meeting : no_answer, reported.
-- La colonne status est un text + CHECK (pas un enum Postgres nommé).
-- Exécuter dans Supabase → SQL Editor.

alter table public.meetings
  drop constraint if exists meetings_status_check;

alter table public.meetings
  add constraint meetings_status_check
  check (
    status in (
      'scheduled',
      'confirmed',
      'bon_qualified',
      'done',
      'no_answer',
      'cancelled',
      'reported',
      'no_show'
    )
  );
