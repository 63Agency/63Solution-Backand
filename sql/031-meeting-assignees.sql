-- Visibilité RDV : assignees = users internes (staff 63Agency).
-- Distinct de meeting_members (leads clients / rappels WA-email).
-- Exécuter dans Supabase → SQL Editor.

alter table public.meetings
  add column if not exists created_by uuid null references public.users (id) on delete set null;

create index if not exists meetings_created_by_idx
  on public.meetings (created_by);

create table if not exists public.meeting_assignees (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

create index if not exists meeting_assignees_user_id_idx
  on public.meeting_assignees (user_id);

create index if not exists meeting_assignees_meeting_id_idx
  on public.meeting_assignees (meeting_id);

alter table public.meeting_assignees disable row level security;
