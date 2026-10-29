-- Client Portal — pipelines (isolé, jamais public / clickup_leads).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/054-portal-pipelines.sql
-- PowerShell : Get-Content sql/054-portal-pipelines.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/054-portal-pipelines.sql

create schema if not exists portal;

create table if not exists portal.pipelines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  name text not null,
  color text not null default 'gold',
  created_at timestamptz not null default now()
);

create index if not exists portal_pipelines_client_id_idx
  on portal.pipelines (client_id);

comment on table portal.pipelines is
  'Pipelines portail client — scoped par client_id (JWT), isolé du CRM.';
