-- Rappels multi-offset (2d / 24h / 2h) × (whatsapp / email).
-- Note: colonne "reminder_offset" (pas "offset") — OFFSET est un mot réservé PostgreSQL.
-- Exécuter dans Supabase → SQL Editor.

create table if not exists public.meeting_reminders (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'email')),
  reminder_offset text not null check (reminder_offset in ('2d', '24h', '2h')),
  enabled boolean not null default true,
  send_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  sent_at timestamptz null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, channel, reminder_offset)
);

create index if not exists meeting_reminders_due_idx
  on public.meeting_reminders (send_at)
  where status = 'pending';

create index if not exists meeting_reminders_meeting_id_idx
  on public.meeting_reminders (meeting_id);

alter table public.meeting_reminders disable row level security;

-- Préférences rappels (JSONB) sur meetings — défaut = tous activés.
alter table public.meetings
  add column if not exists reminders jsonb not null default '{
    "whatsapp": { "2d": true, "24h": true, "2h": true },
    "email": { "2d": true, "24h": true, "2h": true }
  }'::jsonb;
