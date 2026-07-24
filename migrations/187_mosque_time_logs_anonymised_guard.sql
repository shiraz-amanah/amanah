-- 187_mosque_time_logs_anonymised_guard.sql — Workforce/Timetable Phase 2 (hardening)
-- ============================================================================
-- Narrow sibling of 186 (mosque_shifts) / 157. Rejects an INSERT/UPDATE on
-- mosque_time_logs whose staff_id resolves to a GDPR-ERASED (anonymised) staff
-- row — no fresh time activity may be recorded against an erased identity.
--
-- DELIBERATELY NARROWER THAN 186: offboarded / archived / status='offboarded' /
-- 'suspended' staff are ALL still allowed here, because logging and approving a
-- former member's FINAL WEEK for back-pay is legitimate. Only anonymised_at (the
-- terminal, irreversible erase) is barred — mirrors ONE branch of
-- staffHelpers.isAnonymised, not the whole isCurrentStaff predicate.
--
-- SECURITY DEFINER (like 186): an absolute integrity invariant, no current_user
-- exemption, so the lookup reads true staff state regardless of caller RLS.
-- Scope BOTH INSERT and UPDATE: an anonymised record must not gain a new log NOR
-- have an existing one edited/approved. Retention gating means those logs are
-- years-settled by the time a record can be erased, so blocking edits/approvals
-- costs nothing real; DELETE stays unguarded as the escape hatch for a stray row.
-- BEFORE-row trigger, so it never validates pre-existing rows and cannot fail to
-- attach (see pre-flight). errcode 23514.
-- ============================================================================

begin;

create or replace function public.guard_mosque_time_logs_not_anonymised()
returns trigger
language plpgsql
security definer            -- authoritative read; do NOT change to invoker.
set search_path = public
as $$
declare
  v_anonymised_at timestamptz;
begin
  select anonymised_at into v_anonymised_at
    from public.mosque_staff
   where id = new.staff_id;

  if not found then
    return new;   -- FK will reject a bogus staff_id (23503)
  end if;

  if v_anonymised_at is not null then
    raise exception
      'mosque_time_logs.staff_id % is a GDPR-erased (anonymised) staff record — '
      'no new time activity may be logged or edited against it',
      new.staff_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists mosque_time_logs_guard_not_anonymised on public.mosque_time_logs;
create trigger mosque_time_logs_guard_not_anonymised
  before insert or update on public.mosque_time_logs
  for each row execute function public.guard_mosque_time_logs_not_anonymised();

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- APPLY CHECKLIST (dev first via behcheck-187-dev.mjs, then prod, hash):
--   0. PRE-FLIGHT (informational; can't block attach) — existing logs against an
--      anonymised staff row:
--        select tl.id, tl.staff_id, ms.anonymised_at
--          from public.mosque_time_logs tl
--          join public.mosque_staff ms on ms.id = tl.staff_id
--         where ms.anonymised_at is not null;
--   1. Apply.
--   2. Trigger present (BEFORE INSERT OR UPDATE).
--   3. ALLOWED — a log for a CURRENT staff member inserts (txn+rollback).
--   4. ALLOWED (the differentiator vs 186) — a log for an OFFBOARDED staff member
--      inserts fine (back-pay). MUST NOT raise.
--   5. REJECT — a log for an ANONYMISED staff member raises 23514 (INSERT).
--   6. REJECT — editing an existing log to point at an anonymised staff_id raises
--      23514 (UPDATE path).
--   7. HASH — md5(prosrc) of guard_mosque_time_logs_not_anonymised, dev==prod.
-- ============================================================================
