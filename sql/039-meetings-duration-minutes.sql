-- Durée des rendez-vous (minutes). Valeurs autorisées : 15, 30, 45, 60, 90, 120.
-- Backfill implicite via DEFAULT 30 (pas de revalidation rétroactive).
-- Exécuter sur PostgreSQL local (docker pg-63agency / DB solution63) — PAS Supabase.

alter table public.meetings
  add column if not exists duration_minutes integer not null default 30;

alter table public.meetings
  drop constraint if exists meetings_duration_minutes_check;

alter table public.meetings
  add constraint meetings_duration_minutes_check
  check (duration_minutes in (15, 30, 45, 60, 90, 120));
