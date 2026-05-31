-- Rôles : admin | admin_whatsapp (plus de user).
-- Exécuter dans Supabase → SQL Editor après 015-users-profile-fields.sql.

update public.users
set role = 'admin'
where lower(trim(role)) in ('superadmin', 'super_admin');

update public.users
set role = 'admin_whatsapp'
where lower(trim(role)) = 'user';

-- Valeur par défaut pour les nouveaux comptes (si la colonne a un default text)
alter table public.users alter column role set default 'admin_whatsapp';
