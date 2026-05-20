-- Colonnes client sur propositions (copie sur le document, sans FK vers public.clients).
-- Exécuter dans Supabase → SQL Editor (après 010-propositions-table.sql).
-- Si client_id existe déjà : exécuter aussi 012-decouple-documents-from-clients.sql.

alter table public.propositions
  add column if not exists client_nom text,
  add column if not exists client_ice text;

update public.propositions
set client_nom = nom_etablissement
where client_nom is null or btrim(client_nom) = '';
