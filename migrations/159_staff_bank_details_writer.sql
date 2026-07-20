-- 159_staff_bank_details_writer.sql
-- ====================================================================
-- Commit C of the bank-details guarded flow, PART 2 (writer + approve first-set).
-- Depends on 158 (mosque_staff_bank_changes audit table).
--
-- Adds:
--   1. Three IMMUTABLE masking helpers (the MASKED-ONLY invariant lives here).
--   2. update_staff_bank_details — OWNER-ONLY (not admin) SECURITY DEFINER writer:
--      validates, writes NORMALISED plaintext to mosque_staff_employment.bank_*
--      (upsert — first-set OR change), inserts a masked bank_changes audit row
--      (old_* NULL on first-set), notified=false. Returns
--      { success, change_id, staff_has_email }.
--   3. approve_onboarding_session — verbatim from 150 with ONE added block: a
--      first-set bank_changes row (old_* NULL, notified=false) when the session
--      carries bank data, so the item-4 flow can fire the anti-fraud email.
--
-- The anti-fraud email itself + the notified flip are the bank_details_changed
-- send-transactional intent (item 3 — app layer, NO new serverless function;
-- Postgres has no pg_net/http here, so an RPC cannot send email). notified is
-- written false here and flipped true by that intent once the email actually
-- sends (two-hop model — Shiraz-approved).
--
-- STORAGE NOTE: bank_* are stored as STRIPPED DIGITS (sort '112233', acct
-- '99887766'). This differs from the onboarding path (150), which stores the
-- session's raw nullif() values as-entered. Logged as a future normalisation
-- pass in NOTES.md — the pre-existing onboarding rows are NOT rewritten here.
--
-- SAFETY: no table DDL, no data rewrite. Three new functions + one CREATE OR
-- REPLACE of an existing function whose ONLY delta is the additive insert block.
-- ====================================================================

begin;

-- ── 1. Masking helpers (pure, immutable) ──────────────────────────────────────
-- Length-preserving is deliberately AVOIDED — fixed bullets so a mask never
-- leaks the value's length. name → 'A••••'; sort → '••-••-••'; acct → '••••1234'.
-- Called only from inside the SECURITY DEFINER writers (run as postgres), so no
-- role needs EXECUTE; revoked from public/anon/authenticated for tidiness.
create or replace function public.mask_bank_name(v text) returns text
 language sql immutable as $$
  select case when nullif(btrim(coalesce(v,'')),'') is null then null
              else left(btrim(v), 1) || '••••' end
$$;

create or replace function public.mask_bank_sort(v text) returns text
 language sql immutable as $$
  select case when nullif(regexp_replace(coalesce(v,''), '\D', '', 'g'),'') is null then null
              else '••-••-••' end
$$;

create or replace function public.mask_bank_acct(v text) returns text
 language sql immutable as $$
  select case when nullif(regexp_replace(coalesce(v,''), '\D', '', 'g'),'') is null then null
              else '••••' || right(regexp_replace(v, '\D', '', 'g'), 4) end
$$;

revoke all on function public.mask_bank_name(text) from public, anon, authenticated;
revoke all on function public.mask_bank_sort(text) from public, anon, authenticated;
revoke all on function public.mask_bank_acct(text) from public, anon, authenticated;

-- ── 2. Writer: update_staff_bank_details (OWNER-ONLY, not admin) ───────────────
create or replace function public.update_staff_bank_details(
  p_staff_id       uuid,
  p_account_name   text,
  p_sort_code      text,
  p_account_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_mosque_id uuid;
  v_email     text;
  v_name      text := btrim(coalesce(p_account_name, ''));
  v_sort      text := regexp_replace(coalesce(p_sort_code, ''),      '\D', '', 'g');
  v_acct      text := regexp_replace(coalesce(p_account_number, ''), '\D', '', 'g');
  v_old_name  text;
  v_old_sort  text;
  v_old_acct  text;
  v_change_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  select ms.mosque_id, ms.email
    into v_mosque_id, v_email
    from public.mosque_staff ms
   where ms.id = p_staff_id;
  if v_mosque_id is null then raise exception 'staff_not_found'; end if;

  -- OWNER ONLY — bank details are the most sensitive staff data (deliberately
  -- NO is_admin() branch, unlike the 158 read policy).
  if not exists (select 1 from public.mosques m
                 where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  -- Validation: name non-empty; sort = 6 digits; account = 8 digits (post-strip).
  if v_name = ''         then raise exception 'account_name_required';   end if;
  if v_sort !~ '^\d{6}$' then raise exception 'sort_code_invalid';       end if;
  if v_acct !~ '^\d{8}$' then raise exception 'account_number_invalid';  end if;

  -- Previous plaintext (for masked-old + first-set detection). May be no row.
  select bank_account_name, bank_sort_code, bank_account_number
    into v_old_name, v_old_sort, v_old_acct
    from public.mosque_staff_employment
   where staff_id = p_staff_id;

  -- Write NORMALISED plaintext (upsert — first-set OR change).
  insert into public.mosque_staff_employment
    (staff_id, mosque_id, bank_account_name, bank_sort_code, bank_account_number)
  values
    (p_staff_id, v_mosque_id, v_name, v_sort, v_acct)
  on conflict (staff_id) do update set
    bank_account_name   = excluded.bank_account_name,
    bank_sort_code      = excluded.bank_sort_code,
    bank_account_number = excluded.bank_account_number,
    updated_at          = now();

  -- Masked audit row. old_* NULL on first-set. notified flipped later by the
  -- bank_details_changed intent once the email actually sends.
  insert into public.mosque_staff_bank_changes
    (mosque_id, staff_id, actor_id,
     old_account_name, old_sort_code, old_account_number,
     new_account_name, new_sort_code, new_account_number, notified)
  values
    (v_mosque_id, p_staff_id, v_uid,
     public.mask_bank_name(v_old_name), public.mask_bank_sort(v_old_sort), public.mask_bank_acct(v_old_acct),
     public.mask_bank_name(v_name),     public.mask_bank_sort(v_sort),     public.mask_bank_acct(v_acct),
     false)
  returning id into v_change_id;

  return jsonb_build_object(
    'success',         true,
    'change_id',       v_change_id,
    'staff_has_email', (v_email is not null and btrim(v_email) <> '')
  );
end;
$$;

revoke all on function public.update_staff_bank_details(uuid, text, text, text) from public, anon;
grant execute on function public.update_staff_bank_details(uuid, text, text, text) to authenticated;

-- ── 3. approve_onboarding_session — 150 body + the first-set bank_changes block ─
-- VERBATIM from migration 150 except the clearly-marked "Commit C" insert block.
create or replace function public.approve_onboarding_session(p_session_id uuid)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare
  v record;
  pers jsonb; rtw jsonb; dbs jsonb; emp jsonb; tax jsonb; bank jsonb;
begin
  select * into v from public.mosque_staff_onboarding_sessions where id = p_session_id for update;
  if not found then raise exception 'not_found'; end if;
  if not owns_onboarding_mosque(v.mosque_id) then raise exception 'not_authorised'; end if;
  if v.status <> 'submitted' then raise exception 'not_submitted'; end if;
  if v.staff_id is null then raise exception 'no_staff_row'; end if;

  pers := coalesce(v.personal_details,   '{}'::jsonb);
  rtw  := coalesce(v.rtw_details,        '{}'::jsonb);
  dbs  := coalesce(v.dbs_details,        '{}'::jsonb);
  emp  := coalesce(v.employment_details, '{}'::jsonb);
  tax  := coalesce(v.tax_details,        '{}'::jsonb);
  bank := coalesce(v.bank_details,       '{}'::jsonb);

  update public.mosque_staff set
    name            = coalesce(nullif(pers->>'name',''), name),
    role            = coalesce(nullif(emp->>'role',''), role),
    phone           = nullif(pers->>'phone',''),
    start_date      = nullif(emp->>'start_date','')::date,
    dbs_status      = coalesce(nullif(dbs->>'dbs_status',''), 'not_checked'),
    dbs_certificate = nullif(dbs->>'dbs_certificate_number',''),
    dbs_expiry_date = nullif(dbs->>'dbs_expiry_date','')::date,
    status          = 'active',
    onboarding_completed_at = now(),
    availability_days  = coalesce(v.availability_days, availability_days),
    availability_notes = coalesce(v.availability_notes, availability_notes),
    onboarding_method       = case v.path
                                when 'remote'    then 'remote_invite'
                                when 'in_person' then 'in_house'
                                else null
                              end
  where id = v.staff_id;   -- email deliberately untouched (055 invariant)

  insert into public.mosque_staff_employment (
    staff_id, mosque_id,
    ni_number, dob, address, emergency_contact_name, emergency_contact_phone,
    bank_account_name, bank_sort_code, bank_account_number,
    contract_type, hours_per_week, salary_rate,
    p46_statement, student_loan, student_loan_plan,
    dbs_check_type, dbs_workforce_type, dbs_id_document_type, dbs_id_document_number,
    dbs_ucheck_reference, dbs_certificate_number, dbs_result_date, dbs_checked_by,
    rtw_check_type, rtw_document_type, rtw_document_number, rtw_share_code,
    rtw_check_date, rtw_expiry_date, rtw_checked_by
  ) values (
    v.staff_id, v.mosque_id,
    nullif(pers->>'ni_number',''), nullif(pers->>'dob','')::date,
    nullif(pers->>'address',''), nullif(pers->>'emergency_contact_name',''),
    nullif(pers->>'emergency_contact_phone',''),
    nullif(bank->>'bank_account_name',''), nullif(bank->>'bank_sort_code',''),
    nullif(bank->>'bank_account_number',''),
    nullif(emp->>'contract_type',''), nullif(emp->>'hours_per_week','')::numeric,
    nullif(emp->>'salary_rate',''),
    nullif(tax->>'p46_statement',''), coalesce((tax->>'student_loan')::boolean, false),
    nullif(tax->>'student_loan_plan',''),
    nullif(dbs->>'dbs_check_type',''), nullif(dbs->>'dbs_workforce_type',''),
    nullif(dbs->>'dbs_id_document_type',''), nullif(dbs->>'dbs_id_document_number',''),
    nullif(dbs->>'dbs_ucheck_reference',''), nullif(dbs->>'dbs_certificate_number',''),
    nullif(dbs->>'dbs_result_date','')::date, nullif(dbs->>'dbs_checked_by',''),
    nullif(rtw->>'rtw_check_type',''), nullif(rtw->>'rtw_document_type',''),
    nullif(rtw->>'rtw_document_number',''), nullif(rtw->>'rtw_share_code',''),
    nullif(rtw->>'rtw_check_date','')::date, nullif(rtw->>'rtw_expiry_date','')::date,
    nullif(rtw->>'rtw_checked_by','')
  )
  on conflict (staff_id) do update set
    ni_number = excluded.ni_number, dob = excluded.dob, address = excluded.address,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    bank_account_name = excluded.bank_account_name, bank_sort_code = excluded.bank_sort_code,
    bank_account_number = excluded.bank_account_number,
    contract_type = excluded.contract_type, hours_per_week = excluded.hours_per_week,
    salary_rate = excluded.salary_rate,
    p46_statement = excluded.p46_statement, student_loan = excluded.student_loan,
    student_loan_plan = excluded.student_loan_plan,
    dbs_check_type = excluded.dbs_check_type, dbs_workforce_type = excluded.dbs_workforce_type,
    dbs_id_document_type = excluded.dbs_id_document_type, dbs_id_document_number = excluded.dbs_id_document_number,
    dbs_ucheck_reference = excluded.dbs_ucheck_reference, dbs_certificate_number = excluded.dbs_certificate_number,
    dbs_result_date = excluded.dbs_result_date, dbs_checked_by = excluded.dbs_checked_by,
    rtw_check_type = excluded.rtw_check_type, rtw_document_type = excluded.rtw_document_type,
    rtw_document_number = excluded.rtw_document_number, rtw_share_code = excluded.rtw_share_code,
    rtw_check_date = excluded.rtw_check_date, rtw_expiry_date = excluded.rtw_expiry_date,
    rtw_checked_by = excluded.rtw_checked_by,
    updated_at = now();

  -- ── Commit C: first-set bank_changes row (old_* NULL — a first population,
  -- NOT a change) so OnboardingReview.approve() can fire the anti-fraud email
  -- (which flips notified). Only when the session actually carries bank data.
  -- Values are masked from the raw session jsonb (NOT normalised — approve stores
  -- the raw values above; masking tolerates spaces/dashes via regexp strip). ──
  if coalesce(nullif(bank->>'bank_account_name',   ''),
              nullif(bank->>'bank_account_number', ''),
              nullif(bank->>'bank_sort_code',      '')) is not null then
    insert into public.mosque_staff_bank_changes
      (mosque_id, staff_id, actor_id,
       old_account_name, old_sort_code, old_account_number,
       new_account_name, new_sort_code, new_account_number, notified)
    values
      (v.mosque_id, v.staff_id, auth.uid(),
       null, null, null,
       public.mask_bank_name(bank->>'bank_account_name'),
       public.mask_bank_sort(bank->>'bank_sort_code'),
       public.mask_bank_acct(bank->>'bank_account_number'),
       false);
  end if;

  update public.mosque_staff_onboarding_sessions
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id;

  insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v.mosque_id, auth.uid(), v.staff_id, 'onboarding_approved',
            jsonb_build_object('session_id', v.id));
  return true;
end; $function$;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-159-dev.mjs, then STOP):
--   P1  pg_proc: mask_bank_name/sort/acct exist; EXECUTE revoked from
--       public/anon/authenticated
--   P2  pg_proc: update_staff_bank_details prosecdef=true, owner=postgres
--   P3  behavioural (BEGIN...ROLLBACK, dev-ref guarded, savepoint per raise):
--       anon blocked · non-owner → not_authorised(42501) · bad sort →
--       sort_code_invalid · bad acct → account_number_invalid · first-set
--       (no prior employment) → upsert row + masked audit (old_* NULL,
--       notified=false, change_id + staff_has_email) · change (prior row) →
--       upsert + audit with old_* masked from prior
--   P4  approve_onboarding_session: session WITH bank → exactly one
--       bank_changes row (old_* NULL, notified=false); session WITHOUT bank →
--       zero rows
--   Then STOP for prod go-ahead.
-- ====================================================================
