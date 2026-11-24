-- Désabonnements bulk email (opt-out).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/062-email-unsubscribes.sql
-- PowerShell : Get-Content sql/062-email-unsubscribes.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/062-email-unsubscribes.sql

create table if not exists public.email_unsubscribes (
  email text primary key,
  unsubscribed_at timestamptz not null default now(),
  source text null
);

comment on table public.email_unsubscribes is
  'Opt-out bulk email — email en minuscule. Exclu de POST /email/broadcast.';

alter table public.email_unsubscribes disable row level security;
