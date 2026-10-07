-- Dashboard KPIs : doublons meetings (phone/lead_id) + closed won/lost (status+updated_at).
-- Exécuter : docker exec -i pg-63agency psql -U postgres -d solution63 < sql/049-dashboard-kpis-indexes.sql

-- Aligné sur normalizeMeetingPhone (JS) : digits → 00 strip → 212XXXXXXXXX.
create or replace function public.normalize_ma_phone(raw text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when d is null or d = '' then null
    when left(d, 3) = '212' then d
    when length(case when left(d, 1) = '0' then substr(d, 2) else d end) = 9
      then '212' || (case when left(d, 1) = '0' then substr(d, 2) else d end)
    when left(d, 1) = '0' then substr(d, 2)
    else d
  end
  from (
    select case
      when left(digits, 2) = '00' then substr(digits, 3)
      else digits
    end as d
    from (
      select nullif(regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g'), '') as digits
    ) s
  ) t;
$$;

comment on function public.normalize_ma_phone(text) is
  'Morocco WhatsApp phone normalize (212XXXXXXXXX). Used by dashboard doublons KPI.';

create index if not exists meetings_contact_phone_idx
  on public.meetings (contact_phone);

create index if not exists meetings_lead_id_idx
  on public.meetings (lead_id);

create index if not exists meetings_meeting_date_status_idx
  on public.meetings (meeting_date, status);

create index if not exists clickup_leads_status_updated_at_idx
  on public.clickup_leads (status, updated_at);

create index if not exists clickup_leads_updated_at_idx
  on public.clickup_leads (updated_at);
