-- clickup_leads : id = UUID interne (pour meetings.leadId)
-- clickup_task_id = id tâche ClickUp
-- Exécuter dans Supabase → SQL Editor.

-- 1) Ancienne PK text `id` → renommer en clickup_task_id + nouveau uuid id
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clickup_leads'
      and column_name = 'id'
      and udt_name = 'text'
  ) then
    alter table public.clickup_leads rename column id to clickup_task_id;

    alter table public.clickup_leads
      add column id uuid not null default gen_random_uuid();

    alter table public.clickup_leads drop constraint if exists clickup_leads_pkey;
    alter table public.clickup_leads add primary key (id);
  end if;
end $$;

-- 2) Environnements partiels : colonnes manquantes
alter table public.clickup_leads
  add column if not exists clickup_task_id text;

alter table public.clickup_leads
  add column if not exists id uuid;

update public.clickup_leads
set id = coalesce(id, gen_random_uuid())
where id is null;

do $$
begin
  alter table public.clickup_leads
    alter column id set default gen_random_uuid();
  alter table public.clickup_leads
    alter column id set not null;
exception
  when others then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clickup_leads_pkey'
  ) then
    alter table public.clickup_leads add primary key (id);
  end if;
exception
  when others then null;
end $$;

-- 3) Unique sur l’id ClickUp (requis pour upsert onConflict)
alter table public.clickup_leads
  drop constraint if exists clickup_leads_clickup_task_id_key;

alter table public.clickup_leads
  add constraint clickup_leads_clickup_task_id_key unique (clickup_task_id);

create index if not exists clickup_leads_clickup_task_id_idx
  on public.clickup_leads (clickup_task_id);
