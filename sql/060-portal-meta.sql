-- Client Portal — Meta / Facebook OAuth (isolé, jamais public / clickup_leads).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/060-portal-meta.sql
-- PowerShell : Get-Content sql/060-portal-meta.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/060-portal-meta.sql

create schema if not exists portal;

create table if not exists portal.meta_connections (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  fb_user_id text,
  user_access_token text not null,
  token_expires_at timestamptz,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_meta_connections_client_key unique (client_id)
);

comment on table portal.meta_connections is
  'Connexion Facebook OAuth portail — 1 par client. Tokens chiffrés (AES-GCM).';

create table if not exists portal.meta_pages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  connection_id uuid not null references portal.meta_connections (id) on delete cascade,
  page_id text not null,
  page_name text,
  page_access_token text not null,
  created_at timestamptz not null default now(),
  constraint portal_meta_pages_client_page_key unique (client_id, page_id)
);

create index if not exists portal_meta_pages_client_id_idx
  on portal.meta_pages (client_id);

comment on table portal.meta_pages is
  'Pages Facebook du client — page_access_token chiffré.';

create table if not exists portal.meta_forms (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  page_id text not null,
  form_id text not null,
  form_name text,
  is_linked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint portal_meta_forms_client_form_key unique (client_id, form_id)
);

create index if not exists portal_meta_forms_client_id_idx
  on portal.meta_forms (client_id);

create index if not exists portal_meta_forms_form_id_idx
  on portal.meta_forms (form_id);

comment on table portal.meta_forms is
  'Lead Forms Meta — is_linked = importer les leads de ce formulaire.';
