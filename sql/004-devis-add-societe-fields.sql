-- Exécuter si la table public.devis existe déjà sans les champs societe_*.
alter table public.devis add column if not exists societe_nom text;
alter table public.devis add column if not exists societe_rc text;
alter table public.devis add column if not exists societe_cnie text;
alter table public.devis add column if not exists societe_ice text;
alter table public.devis add column if not exists societe_tp text;
alter table public.devis add column if not exists societe_adresse text;
alter table public.devis add column if not exists societe_telephone text;
alter table public.devis add column if not exists societe_email text;

update public.devis
set
  societe_nom = coalesce(societe_nom, '63 AGENCY'),
  societe_rc = coalesce(societe_rc, '162821'),
  societe_cnie = coalesce(societe_cnie, 'BE925205'),
  societe_ice = coalesce(societe_ice, '003071765000061'),
  societe_tp = coalesce(societe_tp, '32401025'),
  societe_adresse = coalesce(societe_adresse, '179 Bd La resistance, CASABLANCA, Maroc'),
  societe_telephone = coalesce(societe_telephone, '+212 6 06 67 67 10'),
  societe_email = coalesce(societe_email, 'Contact@63agency.ma');
