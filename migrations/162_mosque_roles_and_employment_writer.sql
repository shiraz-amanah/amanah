-- 162_mosque_roles_and_employment_writer.sql
-- ====================================================================
-- Commit D foundation. Three parts:
--   1. mosque_roles — per-mosque configurable staff roles (replaces the hardcoded
--      ROLE_OPTIONS / ROLES constant). Seeded with the current defaults per mosque
--      (trigger for new mosques + one-time backfill for existing).
--   2. Three new mosque_staff_employment columns (Group 3 inline-edit fields).
--   3. update_staff_employment — OWNER-ONLY SECURITY DEFINER writer (same posture
--      as the 159 bank writer): writes employment terms + a salary_changed audit
--      row in ONE transaction (append-only; the two-call approach is not used).
-- No approve_onboarding_session change (dev-probed: employment_type already set at
-- invite time; salary is admin-only by design).
-- ====================================================================

begin;

-- ── 1. mosque_roles ───────────────────────────────────────────────────────────
create table if not exists public.mosque_roles (
  id            uuid primary key default gen_random_uuid(),
  mosque_id     uuid not null references public.mosques(id)   on delete cascade,
  name          text not null,
  slug          text not null,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id),
  unique (mosque_id, slug)
);
create index if not exists mosque_roles_mosque_idx on public.mosque_roles(mosque_id);

alter table public.mosque_roles enable row level security;
revoke all on public.mosque_roles from anon;

-- Read: owner + admin + any staff member of that mosque (for the dropdown).
drop policy if exists "mosque_roles readable by members" on public.mosque_roles;
create policy "mosque_roles readable by members"
  on public.mosque_roles for select to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
    or public.is_admin()
    or exists (select 1 from public.mosque_staff ms
               where ms.mosque_id = mosque_roles.mosque_id and ms.profile_id = auth.uid())
  );

-- Write (insert/update/delete): owner + admin only.
drop policy if exists "mosque_roles managed by owner" on public.mosque_roles;
create policy "mosque_roles managed by owner"
  on public.mosque_roles for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

-- Seed the current defaults for a mosque. SECURITY DEFINER so the AFTER-INSERT
-- trigger can write regardless of the inserting role. Idempotent.
create or replace function public.seed_default_mosque_roles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.mosque_roles (mosque_id, name, slug, display_order, is_default, created_by)
  select new.id, d.name, d.slug, d.ord, true, new.user_id
    from (values
      ('Teacher','teacher',1), ('Coordinator','coordinator',2), ('Imam','imam',3),
      ('Administrator','administrator',4), ('Receptionist','receptionist',5),
      ('Treasurer','treasurer',6), ('Other','other',7)
    ) as d(name, slug, ord)
  on conflict (mosque_id, slug) do nothing;
  return new;
end; $$;

drop trigger if exists mosques_seed_default_roles on public.mosques;
create trigger mosques_seed_default_roles
  after insert on public.mosques
  for each row execute function public.seed_default_mosque_roles();

-- One-time backfill for existing mosques (idempotent).
insert into public.mosque_roles (mosque_id, name, slug, display_order, is_default, created_by)
select m.id, d.name, d.slug, d.ord, true, m.user_id
  from public.mosques m
  cross join (values
    ('Teacher','teacher',1), ('Coordinator','coordinator',2), ('Imam','imam',3),
    ('Administrator','administrator',4), ('Receptionist','receptionist',5),
    ('Treasurer','treasurer',6), ('Other','other',7)
  ) as d(name, slug, ord)
on conflict (mosque_id, slug) do nothing;

-- ── 2. Group-3 employment columns (nullable; existing notice_period_days untouched)
alter table public.mosque_staff_employment
  add column if not exists place_of_work                text,
  add column if not exists notice_period_employer_weeks integer,
  add column if not exists notice_period_employee_weeks integer;

-- ── 3. update_staff_employment — OWNER-ONLY writer + atomic salary audit ────────
-- FULL-SET semantics (like the 159 bank writer): the client loads current values,
-- applies edits, and sends the complete field set. Only these 10 columns are
-- written — bank_* / ni / personal / dbs / rtw columns are NEVER touched here.
create or replace function public.update_staff_employment(
  p_staff_id                     uuid,
  p_salary_pence                 integer,
  p_hourly_rate_pence            integer,
  p_hours_per_week               numeric,
  p_contract_type                text,
  p_notice_period_employer_weeks integer,
  p_notice_period_employee_weeks integer,
  p_probation_end_date           date,
  p_place_of_work                text,
  p_pension_enrolled             boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid            uuid := auth.uid();
  v_mosque_id      uuid;
  v_emp_type       text;
  v_old_salary     integer;
  v_old_hourly     integer;
  v_salary_changed boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  select ms.mosque_id, ms.employment_type into v_mosque_id, v_emp_type
    from public.mosque_staff ms where ms.id = p_staff_id;
  if v_mosque_id is null then raise exception 'staff_not_found'; end if;

  -- OWNER ONLY (same posture as the 159 bank writer; stricter than the 060 table
  -- RLS, which also allows admin — pay is treated as owner-sensitive).
  if not exists (select 1 from public.mosques m where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if p_salary_pence      is not null and p_salary_pence      < 0 then raise exception 'salary_invalid';      end if;
  if p_hourly_rate_pence is not null and p_hourly_rate_pence < 0 then raise exception 'hourly_rate_invalid'; end if;
  if p_hours_per_week    is not null and p_hours_per_week    < 0 then raise exception 'hours_invalid';       end if;

  select salary_pence, hourly_rate_pence into v_old_salary, v_old_hourly
    from public.mosque_staff_employment where staff_id = p_staff_id;

  insert into public.mosque_staff_employment (
    staff_id, mosque_id, salary_pence, hourly_rate_pence, hours_per_week, contract_type,
    notice_period_employer_weeks, notice_period_employee_weeks, probation_end_date,
    place_of_work, pension_enrolled
  ) values (
    p_staff_id, v_mosque_id, p_salary_pence, p_hourly_rate_pence, p_hours_per_week, nullif(p_contract_type,''),
    p_notice_period_employer_weeks, p_notice_period_employee_weeks, p_probation_end_date,
    nullif(p_place_of_work,''), coalesce(p_pension_enrolled, false)
  )
  on conflict (staff_id) do update set
    salary_pence                 = excluded.salary_pence,
    hourly_rate_pence            = excluded.hourly_rate_pence,
    hours_per_week               = excluded.hours_per_week,
    contract_type                = excluded.contract_type,
    notice_period_employer_weeks = excluded.notice_period_employer_weeks,
    notice_period_employee_weeks = excluded.notice_period_employee_weeks,
    probation_end_date           = excluded.probation_end_date,
    place_of_work                = excluded.place_of_work,
    pension_enrolled             = excluded.pension_enrolled,
    updated_at                   = now();

  -- Append-only salary audit — one row when either pay figure actually changes.
  if v_old_salary is distinct from p_salary_pence
     or v_old_hourly is distinct from p_hourly_rate_pence then
    v_salary_changed := true;
    insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque_id, v_uid, p_staff_id, 'salary_changed',
      jsonb_build_object(
        'employment_type',        v_emp_type,
        'changed_by',             v_uid,
        'from_salary_pence',      v_old_salary,  'to_salary_pence',      p_salary_pence,
        'from_hourly_rate_pence', v_old_hourly,  'to_hourly_rate_pence', p_hourly_rate_pence
      ));
  end if;

  return jsonb_build_object('success', true, 'salary_changed', v_salary_changed);
end; $$;

revoke all on function public.update_staff_employment(uuid,integer,integer,numeric,text,integer,integer,date,text,boolean) from public, anon;
grant execute on function public.update_staff_employment(uuid,integer,integer,numeric,text,integer,integer,date,text,boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-162-dev.mjs, then STOP):
--   P1  mosque_roles: 9 cols; unique(mosque_id,slug); 2 policies (select readers +
--       all owner/admin); anon revoked; backfill 7 roles/mosque; seed trigger fires
--       on a new-mosque INSERT.
--   P2  employment cols: place_of_work / notice_period_employer_weeks /
--       notice_period_employee_weeks present + nullable.
--   P3  update_staff_employment prosecdef=true, owner=postgres, anon denied,
--       authenticated granted.
--   P4  behavioural (BEGIN...ROLLBACK, dev-ref, savepoint-per-raise): anon blocked;
--       non-owner→42501; negative salary→salary_invalid; owner first-set→row + one
--       salary_changed(null→value); owner salary change→one row correct from/to;
--       owner non-salary change→NO audit row; bank/ni untouched by the RPC.
--   Then STOP for prod go-ahead.
-- ====================================================================
