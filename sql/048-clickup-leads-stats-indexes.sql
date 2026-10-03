-- Indexes for leads dashboard aggregates (status / list / created_at period).
-- status + list_id already indexed in 020 ; ensure created_at + Casa day expression.
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/048-clickup-leads-stats-indexes.sql

create index if not exists clickup_leads_status_idx
  on public.clickup_leads (status);

create index if not exists clickup_leads_list_id_idx
  on public.clickup_leads (list_id);

create index if not exists clickup_leads_created_at_idx
  on public.clickup_leads (created_at);

create index if not exists clickup_leads_created_at_casa_day_idx
  on public.clickup_leads (
    ((created_at at time zone 'Africa/Casablanca')::date)
  );
