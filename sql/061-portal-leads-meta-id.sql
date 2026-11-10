-- Client Portal — Meta Lead Ads webhook idempotency (meta_lead_id).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/061-portal-leads-meta-id.sql
-- PowerShell : Get-Content sql/061-portal-leads-meta-id.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/061-portal-leads-meta-id.sql

create schema if not exists portal;

alter table portal.leads
  add column if not exists meta_lead_id text;

comment on column portal.leads.meta_lead_id is
  'Facebook leadgen_id — déduplique les imports webhook Meta.';

-- Unique per client when meta_lead_id is set (manual leads stay NULL).
create unique index if not exists portal_leads_client_meta_lead_id_uidx
  on portal.leads (client_id, meta_lead_id)
  where meta_lead_id is not null;

create index if not exists portal_leads_meta_lead_id_idx
  on portal.leads (meta_lead_id)
  where meta_lead_id is not null;
