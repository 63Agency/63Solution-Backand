-- Clients agrégés par utilisateur (dashboard + dédoublonnage email / ICE).
-- Exécuter dans Supabase SQL Editor.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_nom text not null,
  client_email text,
  client_telephone text,
  client_ice text,
  created_by uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_created_by_idx on public.clients (created_by);

-- Un client par email (normalisé minuscules) pour un même propriétaire
create unique index if not exists clients_owner_email_key
  on public.clients (created_by, lower(btrim(client_email)))
  where client_email is not null and btrim(client_email) <> '';

-- Un client par ICE pour un même propriétaire (sans email en conflit ailleurs géré par logique app)
create unique index if not exists clients_owner_ice_key
  on public.clients (created_by, upper(btrim(client_ice)))
  where client_ice is not null and btrim(client_ice) <> '';
