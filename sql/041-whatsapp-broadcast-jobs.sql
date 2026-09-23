-- Jobs broadcast WhatsApp async (template only, worker in-process).
-- Exécuter sur PostgreSQL local (docker pg-63agency / DB solution63) — PAS Supabase.

create table if not exists public.whatsapp_broadcast_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid null references public.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  message_config jsonb not null,
  phone_numbers jsonb not null,
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  cursor_index integer not null default 0,
  error text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null
);

create index if not exists whatsapp_broadcast_jobs_status_created_idx
  on public.whatsapp_broadcast_jobs (status, created_at);

create index if not exists whatsapp_broadcast_jobs_created_at_idx
  on public.whatsapp_broadcast_jobs (created_at desc);

create table if not exists public.whatsapp_broadcast_job_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.whatsapp_broadcast_jobs (id) on delete cascade,
  phone_number text not null,
  success boolean not null default false,
  conversation_id uuid null,
  message_id uuid null,
  error text null,
  created_at timestamptz not null default now(),
  unique (job_id, phone_number)
);

create index if not exists whatsapp_broadcast_job_results_job_created_idx
  on public.whatsapp_broadcast_job_results (job_id, created_at);

alter table public.whatsapp_broadcast_jobs disable row level security;
alter table public.whatsapp_broadcast_job_results disable row level security;
