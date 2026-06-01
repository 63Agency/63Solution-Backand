-- Métadonnées médias Cloudinary (Nest upload API).
-- Exécuter dans Supabase → SQL Editor.

create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  secure_url text not null,
  resource_type text not null check (resource_type in ('image', 'video')),
  format text,
  width integer,
  height integer,
  duration numeric,
  folder text,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists media_files_public_id_key
  on public.media_files (public_id);

create index if not exists media_files_user_created_idx
  on public.media_files (user_id, created_at desc);

alter table public.media_files disable row level security;
