-- Exécuter une fois pour aligner la DB avec les limites DTO (évite incohérences).
alter table public.devis
  drop constraint if exists devis_societe_nom_len,
  drop constraint if exists devis_societe_rc_len,
  drop constraint if exists devis_societe_cnie_len,
  drop constraint if exists devis_societe_ice_len,
  drop constraint if exists devis_societe_tp_len,
  drop constraint if exists devis_societe_adresse_len,
  drop constraint if exists devis_societe_telephone_len,
  drop constraint if exists devis_societe_email_len;

alter table public.devis
  add constraint devis_societe_nom_len check (char_length(societe_nom) <= 150),
  add constraint devis_societe_rc_len check (char_length(societe_rc) <= 60),
  add constraint devis_societe_cnie_len check (char_length(societe_cnie) <= 60),
  add constraint devis_societe_ice_len check (char_length(societe_ice) <= 60),
  add constraint devis_societe_tp_len check (char_length(societe_tp) <= 60),
  add constraint devis_societe_adresse_len check (char_length(societe_adresse) <= 255),
  add constraint devis_societe_telephone_len check (char_length(societe_telephone) <= 60),
  add constraint devis_societe_email_len check (char_length(societe_email) <= 120);
