-- 186_mosque_shifts_current_staff_guard.sql — Workforce/Timetable, PHASE 1 (hardening)
-- ============================================================================
-- Defense-in-depth for mosque_shifts, same family as 157's privileged-column
-- guard. RLS on mosque_shifts (180) bounds an owner to their OWN mosque's staff,
-- but places no lifecycle bar on staff_id — so the owner-only write path can
-- reference an offboarded or anonymised staff row. The WorkforceTab grid already
-- filters schedulable staff through isCurrentStaff (f53a729); this trigger makes
-- the database enforce the same invariant against any client that bypasses the UI.
--
-- REJECTS an INSERT/UPDATE whose staff_id resolves to a NON-CURRENT staff row.
-- "Non-current" mirrors src/lib/staffHelpers.isCurrentStaff EXACTLY (not a new
-- definition): anonymised (anonymised_at) OR former (offboarded_at / status
-- 'offboarded' / archived). status='suspended' (product "Inactive") stays
-- schedulable — isCurrentStaff includes it, the grid lists it, so does this.
--
-- SECURITY DEFINER (unlike 157's INVOKER): this is an ABSOLUTE data-integrity
-- invariant, not a current_user branch — no writer is exempt, so the lookup must
-- read the true staff state regardless of the caller's RLS visibility. Locked
-- search_path. 157 needed INVOKER only because it branched on current_user to
-- exempt the definer RPCs; there is no such exemption here.
--
-- Scope: BOTH INSERT and UPDATE (per the queued spec). DELETE is unguarded — a
-- shift for a now-former member can always be removed. Editing such a shift is
-- blocked by design; the correct action is to delete it. This trigger does NOT
-- validate pre-existing rows (BEFORE-row triggers never do), so it cannot fail
-- to attach — see the pre-flight, which surfaces any legacy violators for a
-- manual sweep, and NEVER blocks the migration.
--
-- FK ordering: BEFORE-row triggers fire before the staff_id FK is validated, so
-- a bogus staff_id may not resolve here yet — on not-found we return NEW and let
-- the FK raise 23503. No table DDL, no data rewrite.
-- ============================================================================

begin;

create or replace function public.guard_mosque_shifts_current_staff()
returns trigger
language plpgsql
security definer            -- authoritative read; see header. Do NOT change to invoker.
set search_path = public
as $$
declare
  v_status        text;
  v_archived      boolean;
  v_offboarded_at timestamptz;
  v_anonymised_at timestamptz;
begin
  select status, archived, offboarded_at, anonymised_at
    into v_status, v_archived, v_offboarded_at, v_anonymised_at
    from public.mosque_staff
   where id = new.staff_id;

  if not found then
    return new;   -- FK will reject a bogus staff_id (23503); not our job here
  end if;

  -- Mirrors staffHelpers.isCurrentStaff: reject anonymised OR former.
  if v_anonymised_at is not null
     or v_offboarded_at is not null
     or v_status = 'offboarded'
     or v_archived is true then
    raise exception
      'mosque_shifts.staff_id % is not a current staff member '
      '(anonymised or offboarded/archived) — cannot schedule a shift for them',
      new.staff_id
      using errcode = '23514';   -- check_violation family (integrity rule)
  end if;

  return new;
end;
$$;

drop trigger if exists mosque_shifts_guard_current_staff on public.mosque_shifts;
create trigger mosque_shifts_guard_current_staff
  before insert or update on public.mosque_shifts
  for each row execute function public.guard_mosque_shifts_current_staff();

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- APPLY CHECKLIST (dev first, verify raw rows, then prod through Shiraz, hash):
--
-- 0. PRE-FLIGHT (informational — a BEFORE-row trigger does NOT re-validate
--    existing rows, so this CANNOT block the apply; it surfaces any shift that
--    already references a non-current staff member for a manual sweep). Expect 0
--    (the fixed grid never wrote one; the pre-fix grid predates any offboarding):
--      select sh.id, sh.staff_id, ms.status, ms.archived,
--             ms.offboarded_at, ms.anonymised_at, sh.shift_date
--        from public.mosque_shifts sh
--        join public.mosque_staff ms on ms.id = sh.staff_id
--       where ms.anonymised_at is not null
--          or ms.offboarded_at is not null
--          or ms.status = 'offboarded'
--          or ms.archived is true;
--
-- 1. Apply this file.
--
-- 2. Trigger attached (expect 1 row, tgtype = 'BEFORE INSERT OR UPDATE'):
--      select tgname from pg_trigger
--       where tgrelid = 'public.mosque_shifts'::regclass
--         and tgname = 'mosque_shifts_guard_current_staff';
--
-- 3. HAPPY PATH unaffected — a shift for a CURRENT staff member inserts fine
--    (run in a txn, ROLLBACK so nothing persists):
--      begin;
--      insert into public.mosque_shifts (mosque_id, staff_id, shift_date, start_time, end_time)
--        select ms.mosque_id, ms.id, date '2999-01-02', time '09:00', time '11:00'
--          from public.mosque_staff ms
--         where ms.anonymised_at is null and ms.offboarded_at is null
--           and ms.status <> 'offboarded' and ms.archived is not true
--         limit 1;
--      rollback;   -- expect: INSERT 0 1, then rolled back (no error)
--
-- 4. REJECTION 1 — OFFBOARDED staff (txn + ROLLBACK). Seed a scratch offboarded
--    row, insert a shift for it → the insert must raise SQLSTATE 23514:
--      begin;
--      with s as (
--        insert into public.mosque_staff (mosque_id, name, status, offboarded_at)
--          select id, 'BEHCHECK offboarded', 'offboarded', now()
--            from public.mosques limit 1
--          returning id, mosque_id)
--      insert into public.mosque_shifts (mosque_id, staff_id, shift_date, start_time, end_time)
--        select mosque_id, id, date '2999-01-03', time '09:00', time '11:00' from s;
--      rollback;   -- expect: ERROR 23514 on the shift insert, then rolled back
--
-- 5. REJECTION 2 — ANONYMISED staff (txn + ROLLBACK). Same shape with
--    anonymised_at set → must raise 23514:
--      begin;
--      with s as (
--        insert into public.mosque_staff (mosque_id, name, status, anonymised_at)
--          select id, 'BEHCHECK anonymised', 'active', now()
--            from public.mosques limit 1
--          returning id, mosque_id)
--      insert into public.mosque_shifts (mosque_id, staff_id, shift_date, start_time, end_time)
--        select mosque_id, id, date '2999-01-04', time '09:00', time '11:00' from s;
--      rollback;   -- expect: ERROR 23514, then rolled back
--
-- 6. REJECTION 3 (UPDATE path) — a valid shift edited to point at a non-current
--    staff_id must also raise 23514 (proves BOTH INSERT and UPDATE are covered).
--    All in one txn; ROLLBACK so nothing persists:
--      begin;
--      with cur as (
--        insert into public.mosque_staff (mosque_id, name, status)
--          select id, 'BEHCHECK current (upd)', 'active'
--            from public.mosques limit 1
--          returning id, mosque_id),
--      sh as (
--        insert into public.mosque_shifts (mosque_id, staff_id, shift_date, start_time, end_time)
--          select mosque_id, id, date '2999-01-05', time '09:00', time '11:00' from cur
--          returning id),
--      off as (
--        insert into public.mosque_staff (mosque_id, name, status, offboarded_at)
--          select id, 'BEHCHECK offboarded (upd)', 'offboarded', now()
--            from public.mosques limit 1
--          returning id)
--      update public.mosque_shifts
--         set staff_id = (select id from off)
--       where id = (select id from sh);
--      rollback;   -- expect: ERROR 23514 on the UPDATE, then rolled back
--
-- 7. HASH — one function object. Record md5(prosrc) on dev, match on prod:
--      select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.proname='guard_mosque_shifts_current_staff';
-- ============================================================================
