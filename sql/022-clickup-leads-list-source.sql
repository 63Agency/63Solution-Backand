-- Multi-list ClickUp sync: ensure source list columns exist for UI filtering.
-- list_id / list_name already defined in 020-clickup-leads-table.sql;
-- this migration is idempotent for older environments.

alter table public.clickup_leads
  add column if not exists list_id text;

alter table public.clickup_leads
  add column if not exists list_name text;

create index if not exists clickup_leads_list_id_idx
  on public.clickup_leads (list_id);
