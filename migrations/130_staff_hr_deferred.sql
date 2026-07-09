-- 130_staff_hr_deferred.sql
-- ====================================================================
-- Session RBAC-B — the deferred bundle collected during the People-tab build.
-- Additive only; safe to run once dev + prod. After applying, a small client
-- wiring commit activates the features that render placeholders today.
--   1. last_login_at (mosque_staff)      — written on sign-in; §Account "Last login"
--   2. rtw_refused (mosque_staff_employment) — enables the RTW "Refused" badge
--   3. mosque_staff_review_notes table   — StaffProfile §10 review notes
--   4. get_staff_employment RPC          — StaffProfile §3 employment terms
--   5. get_staff_performance RPC         — StaffProfile §10 auto-metrics
--   6. get_mosque_staff_list +3 columns  — last_login_at, show_dbs_badge_publicly,
--                                           rtw_refused (badge/§11 needs)
-- ====================================================================

-- 1 + 2) new columns
alter table public.mosque_staff
  add column if not exists last_login_at timestamptz;
alter table public.mosque_staff_employment
  add column if not exists rtw_refused boolean default false;

-- 3) review notes (management-internal: owner manages, admin reads; no self-read)
create table if not exists public.mosque_staff_review_notes (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.mosque_staff(id) on delete cascade,
  mosque_id  uuid not null references public.mosques(id) on delete cascade,
  author_id  uuid references public.profiles(id),
  note       text not null,
  created_at timestamptz not null default now()
);
create index if not exists mosque_staff_review_notes_staff_idx
  on public.mosque_staff_review_notes(staff_id);

alter table public.mosque_staff_review_notes enable row level security;
revoke all on public.mosque_staff_review_notes from anon;

create policy "Owner manages review notes" on public.mosque_staff_review_notes
  for all to authenticated using (mosque_id in (
    select id from public.mosques where user_id = auth.uid()));
create policy "Admin reads review notes" on public.mosque_staff_review_notes
  for select to authenticated using (public.is_admin());

notify pgrst, 'reload schema';

-- 4) employment terms (owner-only; NOT audited — these aren't reveal-grade.
--    Salary/bank/DOB/doc-numbers stay on the audited get_staff_salary/sensitive.)
create or replace function public.get_staff_employment(p_staff_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid; v_result jsonb;
begin
  select s.mosque_id, jsonb_build_object(
      'employment_type',    s.employment_type,
      'hours_per_week',     e.hours_per_week,
      'contract_type',      e.contract_type,
      'notice_period_days', e.notice_period_days,
      'probation_end_date', e.probation_end_date,
      'pension_enrolled',   e.pension_enrolled
    ) into v_mosque, v_result
    from mosque_staff s
    left join mosque_staff_employment e on e.staff_id = s.id
    join mosques m on m.id = s.mosque_id
    where s.id = p_staff_id and m.user_id = v_uid;
  if v_mosque is null then raise exception 'not_mosque_owner'; end if;
  return v_result;
end; $$;

-- 5) performance auto-metrics over the staff member's assigned classes.
--    attendance% = (present+late)/total; homework% = completions / (homeworks ×
--    active enrolments); hifz = memorized/total. Each null when no data (guards
--    divide-by-zero). Owner/admin only.
create or replace function public.get_staff_performance(p_staff_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid(); v_mosque uuid;
  v_att_total int; v_att_ok int;
  v_hw_done int; v_hw_expected int;
  v_hifz_total int; v_hifz_mem int;
begin
  select mosque_id into v_mosque from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque and user_id = v_uid)
     and not is_admin() then
    raise exception 'not_authorised';
  end if;

  select count(*), count(*) filter (where status in ('present','late'))
    into v_att_total, v_att_ok
    from madrasa_attendance
    where class_id in (select id from madrasa_classes where teacher_staff_id = p_staff_id);

  select count(*) into v_hw_done
    from madrasa_homework_completions
    where class_id in (select id from madrasa_classes where teacher_staff_id = p_staff_id);
  select count(*) into v_hw_expected
    from madrasa_homework h
    join madrasa_enrollments en on en.class_id = h.class_id and en.status = 'active'
    where h.class_id in (select id from madrasa_classes where teacher_staff_id = p_staff_id);

  select count(*), count(*) filter (where status = 'memorized')
    into v_hifz_total, v_hifz_mem
    from madrasa_hifz_progress
    where class_id in (select id from madrasa_classes where teacher_staff_id = p_staff_id);

  return jsonb_build_object(
    'attendance_pct', case when v_att_total  > 0 then round(100.0 * v_att_ok   / v_att_total,  0) end,
    'homework_pct',   case when v_hw_expected > 0 then round(100.0 * v_hw_done  / v_hw_expected,0) end,
    'hifz_avg',       case when v_hifz_total > 0 then round(100.0 * v_hifz_mem / v_hifz_total, 0) end
  );
end; $$;

-- 6) get_mosque_staff_list — add last_login_at, show_dbs_badge_publicly, rtw_refused
-- DROP first: the RETURNS TABLE signature changed, so CREATE OR REPLACE alone
-- errors ("cannot change return type of existing function") on re-apply/prod.
drop function if exists public.get_mosque_staff_list(uuid);
create or replace function public.get_mosque_staff_list(p_mosque_id uuid)
returns table (
  id uuid, mosque_id uuid, name text, email text, photo_url text,
  role text, job_title text, department text, staff_type text,
  employment_type text, status text, invite_status text, archived boolean,
  start_date date, end_date date, onboarding_completed_at timestamptz,
  onboarding_method text, listed_on_marketplace boolean,
  show_dbs_badge_publicly boolean, show_on_profile boolean, linked_scholar_id uuid,
  annual_leave_days integer, leave_balance_days numeric,
  dbs_status text, dbs_level text, dbs_expiry_date date, dbs_required boolean,
  rtw_verified boolean, rtw_refused boolean, rtw_expiry_date date, rtw_document_type text,
  last_login_at timestamptz, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  if not exists (select 1 from mosques where id = p_mosque_id and user_id = v_uid)
     and not is_admin() then
    raise exception 'not_mosque_owner';
  end if;
  return query
    select s.id, s.mosque_id, s.name, s.email, s.photo_url,
           s.role, s.job_title, s.department, s.staff_type,
           s.employment_type, s.status, s.invite_status, s.archived,
           s.start_date, s.end_date, s.onboarding_completed_at,
           s.onboarding_method, s.listed_on_marketplace,
           s.show_dbs_badge_publicly, s.show_on_profile, s.linked_scholar_id,
           s.annual_leave_days, s.leave_balance_days,
           s.dbs_status, s.dbs_level, s.dbs_expiry_date, s.dbs_required,
           e.rtw_verified, e.rtw_refused, e.rtw_expiry_date, e.rtw_document_type,
           s.last_login_at, s.created_at
      from mosque_staff s
      left join mosque_staff_employment e on e.staff_id = s.id
      where s.mosque_id = p_mosque_id
        and s.deleted_at is null
      order by s.created_at desc;
end; $$;

-- 7) stamp last_login_at on mosque_staff for the caller's own row(s) — MOSQUE-
--    AGNOSTIC (all of the caller's staff rows). SECURITY DEFINER so a staff member
--    can update their own row despite the owner-only UPDATE RLS (030); WHERE
--    profile_id = auth.uid() confines it to their own rows. Called from the App
--    bootstrap on sign-in; no-op / 0 rows if the caller isn't staff.
--    (Drops guard against a prior (uuid) overload from an earlier iteration.)
drop function if exists public.stamp_staff_login(uuid);
drop function if exists public.stamp_staff_login();
create or replace function public.stamp_staff_login()
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update mosque_staff set last_login_at = now() where profile_id = auth.uid();
end; $$;

grant execute on function public.get_staff_employment(uuid)  to authenticated;
grant execute on function public.get_staff_performance(uuid) to authenticated;
grant execute on function public.get_mosque_staff_list(uuid) to authenticated;
grant execute on function public.stamp_staff_login()         to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor / psql-dev (dev), then prod.
--   2. Probe (RAW rows):
--        select column_name from information_schema.columns
--          where table_name='mosque_staff' and column_name='last_login_at';
--        select column_name from information_schema.columns
--          where table_name='mosque_staff_employment' and column_name='rtw_refused';
--        select proname, prosecdef from pg_proc where proname in
--          ('get_staff_employment','get_staff_performance','get_mosque_staff_list');
--        select tablename, policyname, cmd from pg_policies
--          where tablename='mosque_staff_review_notes';
--        select grantee from information_schema.role_table_grants
--          where table_name='mosque_staff_review_notes' and grantee='anon'; -- 0 rows
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
