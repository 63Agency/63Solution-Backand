-- Admin pour Nest + table public.users (mot de passe hashé avec bcrypt côté projet).
-- Exécuter dans Supabase → SQL Editor (une fois).

insert into public.users (email, password_hash, role)
values (
  lower('Contact@63agency.ma'),
  '$2b$10$bVz0IRISoJOrjvD9.GA/GuFUFZYoeoOIB57wPi4EXrCrqo1wkF/7S',
  'admin'
)
on conflict (email) do update set
  password_hash = excluded.password_hash,
  role = excluded.role;
