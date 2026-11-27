-- CRM overlay (Team Workspace) — couches par-dessus clickup_leads (lecture seule ClickUp).
-- N'altère PAS clickup_leads. Schéma public.
-- Exécuter : psql / docker exec … < sql/065-crm-overlay.sql

create table if not exists public.crm_niches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'gray',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_lead_meta (
  lead_id uuid primary key references public.clickup_leads (id) on delete cascade,
  status text not null default 'new',
  niche_id uuid references public.crm_niches (id) on delete set null,
  owner_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_lead_meta_status_check check (
    status in (
      'new',
      'no_answer',
      'contacted',
      'call_back',
      'meeting_scheduled',
      'no_show',
      'proposal_sent',
      'follow_up',
      'won',
      'lost',
      'archived'
    )
  )
);

create index if not exists crm_lead_meta_status_idx
  on public.crm_lead_meta (status);

create index if not exists crm_lead_meta_niche_id_idx
  on public.crm_lead_meta (niche_id);

create index if not exists crm_lead_meta_owner_id_idx
  on public.crm_lead_meta (owner_id);

comment on table public.crm_niches is
  'CRM niches (Team Workspace) — indépendant ClickUp.';
comment on table public.crm_lead_meta is
  'CRM overlay meta (status/niche/owner) pour clickup_leads — source de vérité CRM.';
