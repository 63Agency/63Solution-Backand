-- Admin pour Nest + table public.users (mot de passe hashé avec bcrypt côté projet).
-- Exécuter dans Supabase → SQL Editor (une fois).

insert into public.users (email, password_hash, role)
values (
  lower('Contact@63agency.ma'),
  '$2b$10$D0EKPLlkq52zeg3tvBlzyua9BvklwehfsZZK0nHoCTfpq3uWs/MYi',
  'admin'
)
on conflict (email) do update set
  password_hash = excluded.password_hash,
  role = excluded.role;
