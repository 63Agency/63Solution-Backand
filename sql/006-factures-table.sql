-- Exécuter une fois dans Supabase SQL Editor.
create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  status text not null default 'draft',
  societe_nom text not null,
  societe_rc text not null,
  societe_cnie text not null,
  societe_ice text not null,
  societe_tp text not null,
  societe_adresse text not null,
  societe_telephone text not null,
  societe_email text not null,
  client_nom text not null,
  client_ice text,
  client_email varchar(120),
  client_telephone varchar(60),
  date_emission date not null,
  lignes jsonb not null default '[]'::jsonb,
  tva_taux numeric(5,2) not null default 20,
  mention_tva text not null default '',
  paiement_mode text not null default '',
  paiement_banque text not null default '',
  paiement_titulaire text not null default '',
  paiement_rib text not null default '',
  total_ht numeric(14,2) not null default 0,
  montant_tva numeric(14,2) not null default 0,
  total_ttc numeric(14,2) not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists factures_created_by_idx on public.factures (created_by);
create index if not exists factures_numero_idx on public.factures (numero);
