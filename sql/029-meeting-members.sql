-- Membres internes (équipe) attachés à un rendez-vous.
-- Snapshot name / phone / email au moment du RDV.
-- Exécuter dans Supabase → SQL Editor.

create table if not exists public.meeting_members (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid null references public.users (id) on delete set null,
  name text not null,
  phone text null,
  email text null,
  created_at timestamptz not null default now()
);

create index if not exists meeting_members_meeting_id_idx
  on public.meeting_members (meeting_id);

alter table public.meeting_members disable row level security;
