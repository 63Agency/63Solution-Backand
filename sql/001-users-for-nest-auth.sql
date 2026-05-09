-- Exécuter une fois dans Supabase → SQL Editor.
-- Table utilisée par Nest (login/register) via le client Supabase + service_role (style Oum Palace).

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
);
