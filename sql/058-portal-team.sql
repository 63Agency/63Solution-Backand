-- Client Portal — équipe / collaborateurs (isolé, jamais public / clickup_leads).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/058-portal-team.sql
-- PowerShell : Get-Content sql/058-portal-team.sql | docker exec -i pg-63agency psql -U postgres -d solution63
-- VPS :     psql -U postgres -d solution63 -f sql/058-portal-team.sql

create schema if not exists portal;

create table if not exists portal.team_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references portal.clients (id) on delete cascade,
  name text not null,
  email text not null,
  password_hash text,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  constraint portal_team_members_role_check check (role in ('member')),
  constraint portal_team_members_client_email_key unique (client_id, email)
);

create index if not exists portal_team_members_client_id_idx
  on portal.team_members (client_id);

comment on table portal.team_members is
  'Collaborateurs portail (role=member). Le owner est portal.clients, pas une ligne ici.';
