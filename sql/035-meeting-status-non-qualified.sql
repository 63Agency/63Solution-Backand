-- Nouveau statut meeting : non_qualified (Non qualifier).
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
      'non_qualified',
      'done',
      'no_answer',
      'cancelled',
      'reported',
      'no_show'
    )
  );
