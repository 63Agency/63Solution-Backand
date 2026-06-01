-- Photo de profil (URL Cloudinary ou autre CDN HTTPS).
-- Exécuter dans Supabase → SQL Editor après 015-users-profile-fields.sql.

alter table public.users
  add column if not exists avatar_url text;
