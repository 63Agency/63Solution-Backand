-- Exécuter une fois dans Supabase → SQL Editor.
create table if not exists public.propositions (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  status text not null default 'draft',
  titre_proposition text not null,
  prepare_pour text not null,
  nom_etablissement text not null,
  prepare_par text not null default '',
  date_emission date not null,
  client_nom text,
  client_ice text,
  client_email varchar(120),
  client_telephone varchar(60),
  emetteur jsonb not null default '{}'::jsonb,
  introduction jsonb not null default '{}'::jsonb,
  strategie jsonb not null default '{}'::jsonb,
  tarifs jsonb not null default '{}'::jsonb,
  pourquoi_choisir jsonb not null default '[]'::jsonb,
  prochaines_etapes text not null default '',
  contact jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists propositions_created_by_idx on public.propositions (created_by);
create index if not exists propositions_numero_idx on public.propositions (numero);
create index if not exists propositions_date_emission_idx on public.propositions (date_emission desc);
