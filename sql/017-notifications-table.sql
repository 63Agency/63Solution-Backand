-- Notifications dashboard (WhatsApp + futurs événements).
-- Exécuter dans Supabase → SQL Editor.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text not null,
  href text not null,
  read boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (created_at desc)
  where read = false;

alter table public.notifications disable row level security;
