-- Efficient DESC / ASC keyset pagination on messages (conversation_id, created_at, id).
-- Complements whatsapp_messages_conversation_created_idx (conversation_id, created_at).

create index if not exists whatsapp_messages_conversation_created_id_idx
  on public.whatsapp_messages (conversation_id, created_at desc, id desc);
