-- Client Portal — notes + activité leads (isolé, jamais public / clickup_leads).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/056-portal-notes-activity.sql
-- PowerShell : Get-Content sql/056-portal-notes-activity.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/056-portal-notes-activity.sql

create schema if not exists portal;

create table if not exists portal.lead_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  lead_id uuid not null references portal.leads (id) on delete cascade,
  author text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists portal_lead_notes_client_lead_created_idx
  on portal.lead_notes (client_id, lead_id, created_at);

comment on table portal.lead_notes is
  'Notes portail sur un lead — scoped par client_id (JWT).';

create table if not exists portal.lead_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  lead_id uuid not null references portal.leads (id) on delete cascade,
  kind text not null,
  actor text,
  message text not null,
  detail text,
  created_at timestamptz not null default now(),
  constraint portal_lead_activity_kind_check check (
    kind in (
      'received',
      'stage_change',
      'note',
      'reminder',
      'owner_change'
    )
  )
);

create index if not exists portal_lead_activity_client_lead_created_idx
  on portal.lead_activity (client_id, lead_id, created_at);

comment on table portal.lead_activity is
  'Timeline activité portail (notes, stages, rappels) — scoped par client_id (JWT).';
