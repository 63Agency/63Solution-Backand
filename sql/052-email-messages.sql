-- Fil email par lead (boîte personnelle de l’utilisateur).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/052-email-messages.sql
-- PowerShell : Get-Content sql/052-email-messages.sql | docker exec -i pg-63agency psql -U postgres -d solution63

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.clickup_leads (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  from_email text not null,
  to_email text not null,
  subject text,
  body_html text,
  body_text text,
  message_id text,
  in_reply_to text,
  references_header text,
  status text not null default 'sent',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_messages_lead_id_idx
  on public.email_messages (lead_id, created_at);

comment on column public.email_messages.message_id is
  'RFC Message-ID header (threading).';

alter table public.email_messages disable row level security;
