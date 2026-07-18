-- Media metadata for WhatsApp messages (Cloudinary / Meta).
-- Exécuter dans Supabase → SQL Editor.

alter table public.whatsapp_messages
  add column if not exists media_url text;

alter table public.whatsapp_messages
  add column if not exists file_name text;

alter table public.whatsapp_messages
  add column if not exists file_size bigint;
