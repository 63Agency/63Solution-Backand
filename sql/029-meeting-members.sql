-- Participants côté client (autres leads) attachés à un rendez-vous.
-- Snapshot name / phone / email au moment du RDV.
-- lead_id = id ClickUp (text), pas un user interne.
-- Exécuter dans Supabase → SQL Editor.

-- Si une ancienne version avec user_id a déjà été appliquée :
alter table if exists public.meeting_members
  drop column if exists user_id;

create table if not exists public.meeting_members (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  lead_id text null,
  name text not null,
  phone text null,
  email text null,
  created_at timestamptz not null default now()
);

-- Si la table existait déjà sans lead_id :
alter table public.meeting_members
  add column if not exists lead_id text null;

create index if not exists meeting_members_meeting_id_idx
  on public.meeting_members (meeting_id);

alter table public.meeting_members disable row level security;
