-- Edit / soft-delete columns for WhatsApp messages (CRM edit & delete).
-- Exécuter dans Supabase → SQL Editor.

alter table public.whatsapp_messages
  add column if not exists edited_at timestamptz;

alter table public.whatsapp_messages
  add column if not exists deleted_at timestamptz;

alter table public.whatsapp_messages
  add column if not exists is_deleted boolean not null default false;

-- Keep existing rows consistent if deleted_at was set without the flag.
update public.whatsapp_messages
set is_deleted = true
where deleted_at is not null
  and is_deleted = false;
