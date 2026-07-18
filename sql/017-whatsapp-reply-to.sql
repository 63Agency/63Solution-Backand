-- Reply / quote support for WhatsApp messages
-- Run in Supabase → SQL Editor

alter table public.whatsapp_messages
  add column if not exists reply_to_wati_message_id text;

alter table public.whatsapp_messages
  add column if not exists reply_to_preview text;

alter table public.whatsapp_messages
  add column if not exists reply_to_author text;

create index if not exists whatsapp_messages_reply_to_wati_idx
  on public.whatsapp_messages (reply_to_wati_message_id)
  where reply_to_wati_message_id is not null and btrim(reply_to_wati_message_id) <> '';

-- Needed for upsert ON CONFLICT (wati_message_id)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_wati_message_id_unique'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_wati_message_id_unique unique (wati_message_id);
  end if;
exception
  when unique_violation then
    raise notice 'Cannot add unique constraint — duplicate wati_message_id values exist';
end $$;
