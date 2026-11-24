-- Événements Brevo (transactional webhooks) + corrélation envois bulk.
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/063-email-events.sql
-- PowerShell : Get-Content sql/063-email-events.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/063-email-events.sql

create table if not exists public.email_sends (
  id bigserial primary key,
  message_id text null,
  email text not null,
  subject text null,
  campaign text null,
  sent_at timestamptz not null default now()
);

create index if not exists email_sends_email_idx
  on public.email_sends (email);

create index if not exists email_sends_message_id_idx
  on public.email_sends (message_id);

comment on table public.email_sends is
  'Envois bulk — message_id nodemailer pour corréler avec email_events Brevo.';

alter table public.email_sends disable row level security;

create table if not exists public.email_events (
  id bigserial primary key,
  message_id text null,
  email text not null,
  event text not null,
  subject text null,
  tag text null,
  event_at timestamptz null,
  raw jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists email_events_email_idx
  on public.email_events (email);

create index if not exists email_events_message_id_idx
  on public.email_events (message_id);

create index if not exists email_events_event_idx
  on public.email_events (event);

comment on table public.email_events is
  'Webhooks Brevo transactional — delivered / opened / bounce / etc.';

alter table public.email_events disable row level security;
