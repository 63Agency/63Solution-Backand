-- Fuseau IANA par utilisateur (affichage meetings / dispos côté front).
-- NULL = défaut applicatif Africa/Casablanca.
-- Ne change PAS meetings.meeting_date (timestamptz UTC) ni les bornes métier Casa.

alter table public.users
  add column if not exists timezone text null;

comment on column public.users.timezone is
  'IANA timezone for viewer display (ex Africa/Casablanca, Asia/Ho_Chi_Minh). NULL → Africa/Casablanca.';
