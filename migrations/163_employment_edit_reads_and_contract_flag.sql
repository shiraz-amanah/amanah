-- 163_employment_edit_reads_and_contract_flag.sql
-- ====================================================================
-- D1 read-path + contract-flag foundation. Depends on 162 (the 3 new employment
-- columns + update_staff_employment).
--   1. get_staff_salary → returns BOTH pay figures as jsonb (was integer), still
--      audited ('salary_viewed'). DROP+CREATE — a return-type change can't use
--      CREATE OR REPLACE.
--   2. get_staff_employment → adds place_of_work / notice_period_employer_weeks /
--      notice_period_employee_weeks / contract_terms_changed_at (owner-only,
--      un-audited — non-pay terms). Pay stays in get_staff_salary.
--   3. mosque_staff.contract_terms_changed_at — durable contract-flag signal
--      (nullable; client sets it on a Group-1/2/3 change; cleared on generate /
--      dismiss). NOT 157-guarded so updateMosqueStaff can set it. Deliberately NOT
--      derived from employment.updated_at (bank writes bump that too).
--   4. dismiss_contract_flag(staff) — owner-only, atomic (clear + audit).
-- No approve/update_staff_employment change. No table DDL beyond one nullable col.
-- ====================================================================

begin;

-- 1. Pay read → both figures, audited. DROP+CREATE (return type integer→jsonb).
drop function if exists public.get_staff_salary(uuid);
create function public.get_staff_salary(p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid; v_sal integer; v_hr integer;
begin
  select e.salary_pence, e.hourly_rate_pence, s.mosque_id
    into v_sal, v_hr, v_mosque
    from mosque_staff s
    left join mosque_staff_employment e on e.staff_id = s.id
    join mosques m on m.id = s.mosque_id
    where s.id = p_staff_id and (m.user_id = v_uid or s.profile_id = v_uid);
  if v_mosque is null then raise exception 'not_authorised'; end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action)
    values (v_mosque, v_uid, p_staff_id, 'salary_viewed');
  return jsonb_build_object('salary_pence', v_sal, 'hourly_rate_pence', v_hr);
end; $$;
-- A freshly-created function gets a default PUBLIC EXECUTE grant — revoke it so
-- anon is explicitly denied (matches the 159/160/161 posture; the internal
-- auth.uid() check already blocks anon, this is defense-in-depth).
revoke all on function public.get_staff_salary(uuid) from public, anon;
grant execute on function public.get_staff_salary(uuid) to authenticated;

-- 2. Employment read → + 3 new columns + the contract-flag timestamp.
create or replace function public.get_staff_employment(p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid; v_result jsonb;
begin
  select s.mosque_id, jsonb_build_object(
      'employment_type',              s.employment_type,
      'hours_per_week',               e.hours_per_week,
      'contract_type',                e.contract_type,
      'notice_period_days',           e.notice_period_days,
      'probation_end_date',           e.probation_end_date,
      'pension_enrolled',             e.pension_enrolled,
      'place_of_work',                e.place_of_work,
      'notice_period_employer_weeks', e.notice_period_employer_weeks,
      'notice_period_employee_weeks', e.notice_period_employee_weeks,
      'contract_terms_changed_at',    s.contract_terms_changed_at
    ) into v_mosque, v_result
    from mosque_staff s
    left join mosque_staff_employment e on e.staff_id = s.id
    join mosques m on m.id = s.mosque_id
    where s.id = p_staff_id and m.user_id = v_uid;
  if v_mosque is null then raise exception 'not_mosque_owner'; end if;
  return v_result;
end; $$;
revoke all on function public.get_staff_employment(uuid) from public, anon;
grant execute on function public.get_staff_employment(uuid) to authenticated;

-- 3. Durable contract-flag signal.
alter table public.mosque_staff add column if not exists contract_terms_changed_at timestamptz;

-- 4. Dismiss the contract flag — owner-only, atomic (clear + audit).
create or replace function public.dismiss_contract_flag(p_staff_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_mosque_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select mosque_id into v_mosque_id from public.mosque_staff where id = p_staff_id;
  if v_mosque_id is null then raise exception 'staff_not_found'; end if;
  if not exists (select 1 from public.mosques m where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;
  update public.mosque_staff set contract_terms_changed_at = null where id = p_staff_id;
  insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action)
    values (v_mosque_id, v_uid, p_staff_id, 'contract_flag_dismissed');
  return true;
end; $$;
revoke all on function public.dismiss_contract_flag(uuid) from public, anon;
grant execute on function public.dismiss_contract_flag(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-163-dev.mjs, then STOP):
--   P1 get_staff_salary: return type jsonb (not integer), prosecdef=true,
--      authenticated granted; owner → {salary_pence,hourly_rate_pence} + one
--      salary_viewed audit row; non-owner → not_authorised.
--   P2 get_staff_employment: returns the 4 new keys; non-owner → not_mosque_owner.
--   P3 mosque_staff.contract_terms_changed_at: nullable timestamptz, present.
--   P4 dismiss_contract_flag: prosecdef=true, owner=postgres, anon denied,
--      authenticated granted; owner → col null + one contract_flag_dismissed row;
--      non-owner → not_authorised(42501).
--   Then STOP for prod go-ahead.
-- ====================================================================
