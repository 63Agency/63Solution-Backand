-- Client Portal — leads (isolé, jamais public / clickup_leads).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/055-portal-leads.sql
-- PowerShell : Get-Content sql/055-portal-leads.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/055-portal-leads.sql

create schema if not exists portal;

create table if not exists portal.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  pipeline_id uuid references portal.pipelines (id) on delete set null,
  name text not null,
  phone text,
  email text,
  campaign text,
  owner text,
  estimated_value numeric,
  stage text not null default 'nouveau',
  meta_form_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_leads_stage_check check (
    stage in (
      'nouveau',
      'contacte',
      'sans_reponse',
      'qualifie',
      'rdv_fixe',
      'proposition_envoyee',
      'gagne',
      'perdu'
    )
  )
);

create index if not exists portal_leads_client_stage_idx
  on portal.leads (client_id, stage);

create index if not exists portal_leads_client_created_at_idx
  on portal.leads (client_id, created_at);

create index if not exists portal_leads_client_pipeline_idx
  on portal.leads (client_id, pipeline_id);

comment on table portal.leads is
  'Leads portail client — scoped par client_id (JWT), isolé du CRM clickup_leads.';
