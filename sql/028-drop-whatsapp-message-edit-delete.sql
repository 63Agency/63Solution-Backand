-- Optional cleanup if sql/028-whatsapp-message-edit-delete.sql was already applied.
-- Safe to run even if columns were never added.
-- Exécuter dans Supabase → SQL Editor.

alter table public.whatsapp_messages
  drop column if exists edited_at;

alter table public.whatsapp_messages
  drop column if exists deleted_at;

alter table public.whatsapp_messages
  drop column if exists is_deleted;
