-- Profil utilisateur (Paramètres front).
-- Exécuter dans Supabase → SQL Editor après 001-users-for-nest-auth.sql.

alter table public.users
  add column if not exists prenom text,
  add column if not exists nom text,
  add column if not exists telephone text,
  add column if not exists ville text;
