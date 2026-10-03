-- Tracking commissions : setter (premier call / prise RDV) + closer (tag closer).
-- created_by existe déjà (031). assignedUserIds restent dans meeting_assignees (visibilité).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/046-meetings-setter-closer.sql

alter table public.meetings
  add column if not exists setter_id uuid null references public.users (id) on delete set null,
  add column if not exists closer_id uuid null references public.users (id) on delete set null;

create index if not exists meetings_setter_id_idx
  on public.meetings (setter_id);

create index if not exists meetings_closer_id_idx
  on public.meetings (closer_id);

comment on column public.meetings.setter_id is
  'User who booked the meeting (first call / setter). Commission tracking.';
comment on column public.meetings.closer_id is
  'User tagged as closer (who closes the deal). Commission tracking.';
