-- Client Portal — tâches (isolé, jamais public / clickup_leads).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/057-portal-tasks.sql
-- PowerShell : Get-Content sql/057-portal-tasks.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/057-portal-tasks.sql

create schema if not exists portal;

create table if not exists portal.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  lead_id uuid references portal.leads (id) on delete set null,
  pipeline_id uuid references portal.pipelines (id) on delete set null,
  title text not null,
  lead_name text,
  phone text,
  task_type text not null,
  details text,
  status text not null default 'pending',
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint portal_tasks_task_type_check check (
    task_type in (
      'appel',
      'rendez_vous',
      'whatsapp',
      'relance',
      'devis'
    )
  ),
  constraint portal_tasks_status_check check (
    status in ('pending', 'done', 'cancelled')
  )
);

create index if not exists portal_tasks_client_status_due_idx
  on portal.tasks (client_id, status, due_at);

create index if not exists portal_tasks_client_pipeline_idx
  on portal.tasks (client_id, pipeline_id);

comment on table portal.tasks is
  'Tâches portail client (rappels / appels) — scoped par client_id (JWT).';
