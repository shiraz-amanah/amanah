-- 161_get_staff_bank_masked.sql
-- ====================================================================
-- Commit C, item 2 — owner-only MASKED read of a staff member's bank details.
-- Powers the Employment-panel bank display. Returns ONLY masked values (via the
-- 159 mask_bank_* helpers, computed server-side) + a `saved` boolean — so NO bank
-- plaintext ever reaches the browser, and the display is accurate for EVERY row
-- (incl. legacy rows set via onboarding before the 158 audit table existed, which
-- have no bank_changes row to source a mask from).
--
-- NOT audit-logged: showing masked values is NOT a reveal. The audited full
-- reveal is get_staff_sensitive (129) — bank is deliberately excluded from it.
-- OWNER-ONLY (no is_admin() branch — same posture as update_staff_bank_details).
--
-- SAFETY: one new function, no table DDL, no data rewrite.
-- ====================================================================

begin;

create or replace function public.get_staff_bank_masked(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_mosque_id uuid;
  v_name      text;
  v_sort      text;
  v_acct      text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  select ms.mosque_id into v_mosque_id
    from public.mosque_staff ms where ms.id = p_staff_id;
  if v_mosque_id is null then raise exception 'staff_not_found'; end if;

  if not exists (select 1 from public.mosques m
                 where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  select bank_account_name, bank_sort_code, bank_account_number
    into v_name, v_sort, v_acct
    from public.mosque_staff_employment where staff_id = p_staff_id;

  return jsonb_build_object(
    'saved',          (v_acct is not null and btrim(v_acct) <> ''),
    'account_name',   public.mask_bank_name(v_name),
    'sort_code',      public.mask_bank_sort(v_sort),
    'account_number', public.mask_bank_acct(v_acct)
  );
end;
$$;

revoke all on function public.get_staff_bank_masked(uuid) from public, anon;
grant execute on function public.get_staff_bank_masked(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-161-dev.mjs, then STOP):
--   P1  pg_proc: prosecdef=true, owner=postgres, anon denied, authenticated granted
--   P2  behavioural (BEGIN...ROLLBACK, dev-ref guarded):
--       owner + bank set  → { saved:true, masked values }
--       owner + no bank    → { saved:false, nulls }
--       non-owner          → not_authorised(42501)
--       anon               → blocked
--   Then STOP for prod go-ahead (before any UI).
-- ====================================================================
