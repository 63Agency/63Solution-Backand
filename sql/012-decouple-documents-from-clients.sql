-- Découple devis / factures / propositions de la table clients.
-- Les infos client restent sur chaque document (client_nom, client_email, etc.).
-- Supprimer un devis, une facture ou une proposition ne touche jamais public.clients.
-- Exécuter dans Supabase → SQL Editor.

drop index if exists public.propositions_client_id_idx;

alter table public.propositions
  drop constraint if exists propositions_client_id_fkey;

alter table public.propositions
  drop column if exists client_id;
