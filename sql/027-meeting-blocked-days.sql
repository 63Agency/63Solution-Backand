-- Jours bloqués calendrier (Africa/Casablanca, clé date = YYYY-MM-DD).
-- Exécuter dans Supabase → SQL Editor.

create table if not exists public.meeting_blocked_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  reason text null,
  created_by uuid null references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists meeting_blocked_days_date_idx
  on public.meeting_blocked_days (date);

alter table public.meeting_blocked_days disable row level security;
