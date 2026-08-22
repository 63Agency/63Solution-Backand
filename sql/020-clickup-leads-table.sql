-- Leads ClickUp (webhooks taskCreated / taskUpdated).
-- Exécuter dans Supabase → SQL Editor.
-- id = UUID interne (POST /meetings.leadId)
-- clickup_task_id = id tâche ClickUp

create table if not exists public.clickup_leads (
  id uuid primary key default gen_random_uuid(),
  clickup_task_id text unique,
  name text,
  status text,
  list_id text,
  list_name text,
  phone text,
  email text,
  clickup_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clickup_leads_list_id_idx
  on public.clickup_leads (list_id);

create index if not exists clickup_leads_status_idx
  on public.clickup_leads (status);

create index if not exists clickup_leads_updated_at_idx
  on public.clickup_leads (updated_at desc);

create index if not exists clickup_leads_clickup_task_id_idx
  on public.clickup_leads (clickup_task_id);

alter table public.clickup_leads disable row level security;
