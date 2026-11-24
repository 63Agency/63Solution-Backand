-- Tracking ouvertures email (pixel maison) — bulk / mailbox / transactional.
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/064-email-opens.sql
-- PowerShell : Get-Content sql/064-email-opens.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/064-email-opens.sql

create table if not exists public.email_opens (
  tracking_id uuid primary key default gen_random_uuid(),
  email text not null,
  channel text not null,
  subject text null,
  campaign text null,
  sent_by text null,
  sent_at timestamptz not null default now(),
  opened_at timestamptz null,
  open_count int not null default 0,
  last_ip text null,
  last_user_agent text null
);

create index if not exists email_opens_email_idx
  on public.email_opens (email);

create index if not exists email_opens_opened_at_idx
  on public.email_opens (opened_at);

create index if not exists email_opens_channel_idx
  on public.email_opens (channel);

comment on table public.email_opens is
  'Pixel open-tracking — channel: bulk | mailbox | transactional.';

alter table public.email_opens disable row level security;
