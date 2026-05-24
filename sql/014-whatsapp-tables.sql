-- WhatsApp inbox (Wati webhooks + API Nest).
-- Exécuter dans Supabase → SQL Editor.

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  contact_name text,
  last_message_text text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  status text not null default 'open',
  source text not null default 'wati',
  wati_contact_id text,
  wati_conversation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_conversations_phone_key
  on public.whatsapp_conversations (phone_number);

create index if not exists whatsapp_conversations_last_message_at_idx
  on public.whatsapp_conversations (last_message_at desc nulls last);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text,
  type text not null default 'text',
  status text not null default 'sent',
  wati_message_id text,
  wati_local_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_messages_wati_message_id_key
  on public.whatsapp_messages (wati_message_id)
  where wati_message_id is not null and btrim(wati_message_id) <> '';

create index if not exists whatsapp_messages_conversation_created_idx
  on public.whatsapp_messages (conversation_id, created_at asc);

alter table public.whatsapp_conversations disable row level security;
alter table public.whatsapp_messages disable row level security;
