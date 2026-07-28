-- Déduplication notifications WhatsApp : une ligne par conversation.
-- + idempotence messages déjà couverte par whatsapp_messages_wati_message_id_key (014).
-- Exécuter dans Supabase → SQL Editor.

alter table public.notifications
  add column if not exists conversation_id text;

-- Backfill depuis meta JSON (forcer sur toutes les lignes whatsapp.message)
update public.notifications
set conversation_id = nullif(btrim(meta->>'conversationId'), '')
where type = 'whatsapp.message'
  and meta->>'conversationId' is not null;

-- Supprimer les doublons : garder la plus récente par conversation_id
-- (row_number gère aussi les égalités created_at via id DESC)
delete from public.notifications
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by conversation_id
        order by created_at desc, id desc
      ) as rn
    from public.notifications
    where type = 'whatsapp.message'
      and conversation_id is not null
      and btrim(conversation_id) <> ''
  ) ranked
  where rn > 1
);

create unique index if not exists notifications_whatsapp_conversation_uidx
  on public.notifications (conversation_id)
  where type = 'whatsapp.message'
    and conversation_id is not null
    and btrim(conversation_id) <> '';

create index if not exists notifications_conversation_id_idx
  on public.notifications (conversation_id)
  where conversation_id is not null;
