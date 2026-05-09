-- Ajouter les champs clientEmail/clientTelephone pour devis et factures.
alter table public.devis
  add column if not exists client_email varchar(120),
  add column if not exists client_telephone varchar(60);

alter table public.factures
  add column if not exists client_email varchar(120),
  add column if not exists client_telephone varchar(60);
