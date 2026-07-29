-- Envoi manuel indépendant des jobs auto (2d / 24h / 2h).
-- Exécuter dans Supabase → SQL Editor.

alter table public.meetings
  add column if not exists manual_reminder_sent_at timestamptz null;

alter table public.meetings
  add column if not exists manual_reminder_whatsapp_sent boolean not null default false;

alter table public.meetings
  add column if not exists manual_reminder_email_sent boolean not null default false;
