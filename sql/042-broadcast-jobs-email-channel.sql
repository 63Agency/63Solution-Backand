-- Dual-canal broadcast (WhatsApp + email) sur whatsapp_broadcast_jobs.
-- sent/failed restent les compteurs WhatsApp (rétrocompat jobs existants).
-- Exécuter sur PostgreSQL local (docker pg-63agency / DB solution63) — PAS Supabase.

-- ── Jobs ─────────────────────────────────────────────────
alter table public.whatsapp_broadcast_jobs
  add column if not exists channels jsonb not null default '{"whatsapp":true,"email":false}'::jsonb;

alter table public.whatsapp_broadcast_jobs
  add column if not exists email_config jsonb null;

alter table public.whatsapp_broadcast_jobs
  add column if not exists email_sent integer not null default 0;

alter table public.whatsapp_broadcast_jobs
  add column if not exists email_failed integer not null default 0;

-- message_config peut être vide si whatsapp=false — assouplir NOT NULL via default '{}'
alter table public.whatsapp_broadcast_jobs
  alter column message_config set default '{}'::jsonb;

-- ── Results : une ligne / destinataire, statut par canal ──
alter table public.whatsapp_broadcast_job_results
  alter column phone_number drop not null;

alter table public.whatsapp_broadcast_job_results
  add column if not exists email text null;

alter table public.whatsapp_broadcast_job_results
  add column if not exists name text null;

alter table public.whatsapp_broadcast_job_results
  add column if not exists recipient_key text null;

alter table public.whatsapp_broadcast_job_results
  add column if not exists wa_success boolean null;

alter table public.whatsapp_broadcast_job_results
  add column if not exists wa_error text null;

alter table public.whatsapp_broadcast_job_results
  add column if not exists email_success boolean null;

alter table public.whatsapp_broadcast_job_results
  add column if not exists email_error text null;

alter table public.whatsapp_broadcast_job_results
  add column if not exists email_message_id text null;

-- Backfill recipient_key + wa_* depuis legacy success/error
update public.whatsapp_broadcast_job_results
set
  recipient_key = coalesce(nullif(trim(phone_number), ''), id::text),
  wa_success = coalesce(wa_success, success),
  wa_error = coalesce(wa_error, error)
where recipient_key is null;

alter table public.whatsapp_broadcast_job_results
  alter column recipient_key set not null;

alter table public.whatsapp_broadcast_job_results
  drop constraint if exists whatsapp_broadcast_job_results_job_id_phone_number_key;

create unique index if not exists whatsapp_broadcast_job_results_job_recipient_key_uidx
  on public.whatsapp_broadcast_job_results (job_id, recipient_key);
