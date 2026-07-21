-- 176_get_mosque_staff_list_drop_deleted_at.sql
-- ====================================================================
-- Removes the last live reference to the superseded `deleted_at`
-- concept: the `and s.deleted_at is null` predicate in
-- get_mosque_staff_list's WHERE clause.
--
-- WHY IT IS DEAD. offboard_staff used to write
-- `deleted_at = now() + 2 years`, but this function read the column as a
-- TOMBSTONE (`is null` = alive). Nothing ever compared it to now(), so
-- an offboarded staff member vanished from the staff list immediately
-- and the "2 years" did nothing. Migration 175 superseded the whole idea
-- with `retention_eligible_at`: it stopped writing deleted_at and its
-- backfill cleared every existing value (prod had zero rows to clear;
-- dev likewise). The predicate has therefore been ALWAYS TRUE since 175.
--
-- WHY REMOVE IT RATHER THAN LEAVE IT. It is inert, so this is not a bug
-- fix — it is trap removal. The clause sits in the single function the
-- whole staff lifecycle reads through, and a future reader has every
-- reason to assume a filter in that position is load-bearing: they might
-- preserve it through a rewrite, or "restore" writes to deleted_at to
-- make it meaningful again, quietly reintroducing the two-concepts
-- problem 175 removed. The retention model has exactly one date now.
--
-- NO DROP NEEDED, unlike 173 and 175: the RETURNS TABLE shape is
-- unchanged, so CREATE OR REPLACE is legal — and because nothing is
-- dropped, the existing grants (authenticated only, tightened in 175)
-- SURVIVE UNTOUCHED. No revoke/grant block belongs in this file.
--
-- The statement below was produced by extracting 175's definition
-- programmatically and deleting one line, per the PROD-PACK PRINCIPLE in
-- NOTES.md — not retyped. Asserted at build time: exactly one occurrence
-- of the clause, zero `deleted_at` references remaining.
--
-- The mosque_staff.deleted_at COLUMN is deliberately left in place. It
-- is unreferenced by any writer or reader after this, and dropping a
-- column is a separate, heavier decision than removing a predicate.
-- ====================================================================

create or replace function public.get_mosque_staff_list(p_mosque_id uuid)
returns table (
  id uuid, mosque_id uuid, name text, email text, photo_url text, role text,
  job_title text, department text, staff_type text, employment_type text,
  status text, invite_status text, archived boolean, start_date date,
  end_date date, onboarding_completed_at timestamptz, onboarding_method text,
  listed_on_marketplace boolean, show_dbs_badge_publicly boolean,
  show_on_profile boolean, linked_scholar_id uuid, annual_leave_days integer,
  leave_balance_days numeric, dbs_status text, dbs_level text,
  dbs_expiry_date date, dbs_required boolean, rtw_verified boolean,
  rtw_refused boolean, rtw_expiry_date date, rtw_document_type text,
  last_login_at timestamptz, created_at timestamptz,
  offboarded_at timestamptz, anonymised_at timestamptz,
  retention_eligible_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
           s.last_login_at, s.created_at,
           s.offboarded_at, s.anonymised_at, s.retention_eligible_at
      from mosque_staff s
      left join mosque_staff_employment e on e.staff_id = s.id
      where s.mosque_id = p_mosque_id
      order by s.created_at desc;
end; $function$;
notify pgrst, 'reload schema';

-- Probe after applying (dev then prod):
--   select md5(p.prosrc), length(p.prosrc)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'get_mosque_staff_list';
--
--   select position('deleted_at' in p.prosrc) as has_deleted_at
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'get_mosque_staff_list';
--   -- expect 0
--
--   select grantee from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name = 'get_mosque_staff_list';
--   -- expect authenticated present, anon ABSENT (grants survive a REPLACE)
--
-- Usage verification (NOT shape): the row COUNT must not move. Because
-- the predicate was already always-true, a changed count means something
-- was still writing deleted_at — investigate rather than accept.
