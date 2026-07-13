-- 141_approve_onboarding_method_fix.sql
-- ====================================================================
-- Fixes a bug in 133's approve_onboarding_session — it wrote 'remote_session',
-- which violates mosque_staff_onboarding_method_check (allowed: 'remote_invite',
-- 'in_house'). 133 was never applied to PROD before this fix, so prod applies
-- 133 then 141 in sequence and lands in the correct state (the intermediate
-- 'remote_session' body never runs against prod data). Dev ran 133 first — hence
-- this is a separate migration, not an edit to 133, so the files match what dev
-- actually executed.
-- ====================================================================
-- Session RBAC-D — FIX approve_onboarding_session: it wrote
-- mosque_staff.onboarding_method = 'remote_session', which the
-- mosque_staff_onboarding_method_check constraint REJECTS. Every migration probe
-- passed — the violation only surfaced when a real owner clicked "Approve & add
-- to staff" (rolled back cleanly: no duplicate, no half-promotion).
--
-- LIVE constraint (probed on dev 2026-07-13, pasted — not from the file):
--   CHECK (onboarding_method = ANY (ARRAY['remote_invite'::text,'in_house'::text]))
--   convalidated = true
-- This MATCHES repo migration 128 — no drift. (An earlier round wrongly targeted
-- 'invite'; corrected here to the live value 'remote_invite'.)
--
-- Fix: derive onboarding_method from the session's `path` — 'remote' →
-- 'remote_invite', 'in_person' → 'in_house', else null (the column is nullable).
-- This is the ONLY change from the 133 body; the rest is the constraint-clean
-- verbatim-lifted promotion. approve RETURNS boolean (no RETURNS TABLE), so no
-- 42702 exposure.
--
-- create-or-replace (signature + return type unchanged) preserves the 133 grants.
-- ====================================================================

create or replace function public.approve_onboarding_session(p_session_id uuid)
returns boolean
language plpgsql security definer volatile set search_path = public as $$
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
    -- Map the session's path vocabulary onto the onboarding_method vocabulary.
    -- Live dev constraint (probed): ARRAY['remote_invite','in_house'].
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

  update public.mosque_staff_onboarding_sessions
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id;

  insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v.mosque_id, auth.uid(), v.staff_id, 'onboarding_approved',
            jsonb_build_object('session_id', v.id));
  return true;
end; $$;

notify pgrst, 'reload schema';

-- Probe on dev (RAW) — approve a SUBMITTED session S as its mosque OWNER, then:
--   select status, onboarding_method, onboarding_completed_at
--     from public.mosque_staff where id = (
--       select staff_id from public.mosque_staff_onboarding_sessions where id = '<S>');
--   -- expect: active, remote_invite, <now> ; NO constraint error
--   select count(*) from public.mosque_staff_employment where staff_id = (
--       select staff_id from public.mosque_staff_onboarding_sessions where id = '<S>');  -- 1
--   select bank_account_number is not null from public.mosque_staff_employment where staff_id = ...;  -- t
