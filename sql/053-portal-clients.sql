-- Client Portal — schéma isolé (jamais public / clickup_leads).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/053-portal-clients.sql
-- PowerShell : Get-Content sql/053-portal-clients.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/053-portal-clients.sql

create schema if not exists portal;

create table if not exists portal.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  email text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_clients_email_key unique (email)
);

create index if not exists portal_clients_is_active_idx
  on portal.clients (is_active);

comment on schema portal is
  'Client portal — isolé du CRM (public).';

comment on table portal.clients is
  'Comptes portail client (auth séparée du CRM public.users / public.clients).';
