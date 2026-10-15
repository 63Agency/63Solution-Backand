-- Boîte mail personnelle (SMTP + IMAP) par utilisateur.
-- password_enc = AES-256-GCM (jamais en clair).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/051-user-mail-accounts.sql
-- PowerShell : Get-Content sql/051-user-mail-accounts.sql | docker exec -i pg-63agency psql -U postgres -d solution63

create table if not exists public.user_mail_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  email text not null,
  from_name text,
  smtp_host text not null,
  smtp_port int not null default 465,
  smtp_secure boolean not null default true,
  imap_host text not null,
  imap_port int not null default 993,
  imap_secure boolean not null default true,
  username text not null,
  password_enc text not null,
  active boolean not null default true,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_mail_accounts_user_id_idx
  on public.user_mail_accounts (user_id);

comment on column public.user_mail_accounts.password_enc is
  'SMTP/IMAP password encrypted AES-256-GCM (iv:tag:ciphertext base64). Never plaintext.';

alter table public.user_mail_accounts disable row level security;
