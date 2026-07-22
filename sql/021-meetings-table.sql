-- Meetings / Calendar (rendez-vous + rappels WhatsApp / email).
-- Exécuter dans Supabase → SQL Editor.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null,
  title text not null,
  meeting_date timestamptz not null,
  contact_name text not null,
  contact_phone text null,
  contact_email text null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'done', 'cancelled', 'no_show')),
  reminder_whatsapp_sent boolean not null default false,
  reminder_email_sent boolean not null default false,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_meeting_date_idx
  on public.meetings (meeting_date);

create index if not exists meetings_status_idx
  on public.meetings (status);

alter table public.meetings disable row level security;
