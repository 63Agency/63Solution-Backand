-- Dernière activité socket (présence Employees).
-- timestamptz UTC — pas de conversion locale ici.

alter table public.users
  add column if not exists last_seen timestamptz null;

comment on column public.users.last_seen is
  'Dernière activité socket.io (connexion / déconnexion), UTC.';
