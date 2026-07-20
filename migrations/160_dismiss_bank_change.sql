-- 160_dismiss_bank_change.sql
-- ====================================================================
-- Commit C, item 4 — owner-gated dismiss for a mosque_staff_bank_changes row.
-- Powers the dashboard-insight "Dismiss" button. The 158 table has NO client
-- write policy, so the dismiss goes through this SECURITY DEFINER RPC (bypasses
-- RLS, runs as postgres). OWNER-ONLY (matches update_staff_bank_details; the
-- insight lives on the mosque owner's Amanah-assistant card).
--
-- SAFETY: one new function, no table DDL, no data rewrite.
-- ====================================================================

begin;

create or replace function public.dismiss_bank_change(p_change_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_mosque_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  select mosque_id into v_mosque_id
    from public.mosque_staff_bank_changes where id = p_change_id;
  if v_mosque_id is null then raise exception 'change_not_found'; end if;

  -- OWNER ONLY (no is_admin() branch — same posture as update_staff_bank_details).
  if not exists (select 1 from public.mosques m
                 where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  update public.mosque_staff_bank_changes
     set dismissed = true, dismissed_at = now(), dismissed_by = v_uid
   where id = p_change_id;
  return true;
end;
$$;

revoke all on function public.dismiss_bank_change(uuid) from public, anon;
grant execute on function public.dismiss_bank_change(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-160-dev.mjs, then STOP):
--   P1  pg_proc: prosecdef=true, owner=postgres, anon denied, authenticated granted
--   P2  behavioural (BEGIN...ROLLBACK, dev-ref guarded, savepoint per raise):
--       anon → blocked · non-owner → not_authorised(42501) · bad id →
--       change_not_found · owner → dismissed=true + dismissed_at + dismissed_by=uid
--   Then STOP for prod go-ahead.
-- ====================================================================
