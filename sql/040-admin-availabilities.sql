-- Disponibilités administrateur (créneaux horaires par jour).
-- Un admin gère uniquement ses propres dispos. Slots = [{start:"HH:mm", end:"HH:mm"}].
-- Exécuter sur PostgreSQL local (docker pg-63agency / DB solution63) — PAS Supabase.

create table if not exists public.admin_availabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  timezone text not null,
  slots jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists admin_availabilities_user_id_date_idx
  on public.admin_availabilities (user_id, date);

alter table public.admin_availabilities disable row level security;
