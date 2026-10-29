-- Client Portal — indexes pour agrégations stats (Suivi / Performance / activity).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/059-portal-stats-indexes.sql
-- PowerShell : Get-Content sql/059-portal-stats-indexes.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/059-portal-stats-indexes.sql

-- Rappels 24h + feed activité globale (kind + created_at).
create index if not exists portal_lead_activity_client_kind_created_idx
  on portal.lead_activity (client_id, kind, created_at desc);

-- Performance : GROUP BY owner.
create index if not exists portal_leads_client_owner_idx
  on portal.leads (client_id, owner);

comment on index portal_lead_activity_client_kind_created_idx is
  'Stats: reminders 24h + GET /client/activity.';

comment on index portal_leads_client_owner_idx is
  'Stats: performance par membre (owner).';
