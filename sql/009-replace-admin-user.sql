-- Remplace l’utilisateur Contact@63agency.ma par un nouvel admin (nouvel id + même email),
-- en réattribuant devis / factures / clients à l’id du nouveau compte pour ne pas perdre les données.
-- Mot de passe en clair côté appli : 63Agency@12 (hash bcrypt cost 10, généré au moment de l’écriture du fichier).
-- Exécuter dans Supabase → SQL Editor (production).
--
-- Si une table n’existe pas encore, commenter la ligne UPDATE correspondante.

do $replace_admin$
declare
  old_id uuid;
  new_id uuid;
  temp_email text;
  pwd_hash text := '$2b$10$bVz0IRISoJOrjvD9.GA/GuFUFZYoeoOIB57wPi4EXrCrqo1wkF/7S';
  target_email text := lower('Contact@63agency.ma');
begin
  select u.id
    into old_id
  from public.users u
  where lower(btrim(u.email)) = target_email
  limit 1;

  if old_id is null then
    insert into public.users (email, password_hash, role)
    values (target_email, pwd_hash, 'admin');
    return;
  end if;

  temp_email := 'migration-' || replace(gen_random_uuid()::text, '-', '') || '@63agency.internal';

  insert into public.users (email, password_hash, role)
  values (temp_email, pwd_hash, 'admin')
  returning id into new_id;

  update public.devis set created_by = new_id where created_by = old_id;
  update public.factures set created_by = new_id where created_by = old_id;

  -- Table clients (FK vers users) : mettre à jour avant suppression de l’ancien compte
  update public.clients set created_by = new_id where created_by = old_id;

  delete from public.users where id = old_id;

  update public.users
  set email = target_email
  where id = new_id;
end
$replace_admin$;
