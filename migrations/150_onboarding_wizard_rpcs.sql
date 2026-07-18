-- 150_onboarding_wizard_rpcs.sql
-- ====================================================================
-- Session RBAC-E Part 1 — Commit 3. RPC reworks for the 8-step remote wizard.
-- Apply AFTER 149 (references its new columns).
--
--   1. save_onboarding_step  — remap step#→column for the new order
--        (5=Medical, 6=Tax, 7=Bank) and project step-3 consents/address-history
--        + step-4 availability into their typed columns (149).
--   2. sign_onboarding_contract (NEW) — anon/token step-8 contract e-signature:
--        merges signature+signed_at into the contract jsonb, sets the flags.
--   3. get_onboarding_session_by_token — return the new columns for wizard
--        resume (incl. medical_questionnaire, the employee's OWN Art.9 data;
--        admin-facing reveal stays gated/audited elsewhere). Return type
--        changes → DROP + recreate + re-GRANT.
--   4. approve_onboarding_session — promote availability_days/notes → mosque_staff
--        (146 cols). Does NOT promote medical_questionnaire (session-only).
--        prevent_duty_trained is admin-set, not auto-promoted here.
--
-- 055 email invariant: untouched — no RPC reads or writes email; approve still
-- promotes by UPDATE on the existing staff row and never writes email.
-- ====================================================================

begin;

-- 1. ---------------------------------------------------------------------------
create or replace function public.save_onboarding_step(p_token uuid, p_step integer, p_data jsonb)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare
  v record;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  merged jsonb;
begin
  if octet_length(d::text) > 16384 then return false; end if;

  select * into v from public.mosque_staff_onboarding_sessions where token = p_token for update;
  if not found or v.token_expires_at < now()
     or v.status not in ('in_progress','changes_requested') then
    return false;
  end if;

  -- Merge the step's keys into the matching blob; typed keys (projected to their
  -- own columns below) are stripped from the blob to avoid double-storage.
  merged := case p_step
    when 1 then coalesce(v.personal_details,      '{}'::jsonb) || d
    when 2 then coalesce(v.rtw_details,           '{}'::jsonb) || d
    when 3 then coalesce(v.dbs_details,           '{}'::jsonb) || (d - 'safer_recruitment_declared' - 'dbs_consent_given' - 'address_history')
    when 4 then coalesce(v.employment_details,    '{}'::jsonb) || (d - 'availability_days' - 'availability_notes')
    when 5 then coalesce(v.medical_questionnaire, '{}'::jsonb) || d
    when 6 then coalesce(v.tax_details,           '{}'::jsonb) || d
    when 7 then coalesce(v.bank_details,          '{}'::jsonb) || d
    else null
  end;
  if merged is null then return false; end if;                     -- invalid p_step
  if octet_length(merged::text) > 16384 then return false; end if; -- bound accumulation

  update public.mosque_staff_onboarding_sessions set
    personal_details      = case when p_step = 1 then merged else personal_details      end,
    rtw_details           = case when p_step = 2 then merged else rtw_details           end,
    dbs_details           = case when p_step = 3 then merged else dbs_details           end,
    employment_details    = case when p_step = 4 then merged else employment_details    end,
    medical_questionnaire = case when p_step = 5 then merged else medical_questionnaire end,
    tax_details           = case when p_step = 6 then merged else tax_details           end,
    bank_details          = case when p_step = 7 then merged else bank_details          end,
    -- step-3 typed projections
    safer_recruitment_declared = case when p_step = 3 and d ? 'safer_recruitment_declared'
                                   then (d->>'safer_recruitment_declared')::boolean else safer_recruitment_declared end,
    dbs_consent_given          = case when p_step = 3 and d ? 'dbs_consent_given'
                                   then (d->>'dbs_consent_given')::boolean else dbs_consent_given end,
    address_history            = case when p_step = 3 and d ? 'address_history'
                                   then d->'address_history' else address_history end,
    -- step-4 typed projections
    availability_days  = case when p_step = 4 and d ? 'availability_days'
                           then array(select jsonb_array_elements_text(d->'availability_days')) else availability_days end,
    availability_notes = case when p_step = 4 and d ? 'availability_notes'
                           then nullif(d->>'availability_notes','') else availability_notes end,
    step_completed     = greatest(step_completed, p_step)
  where id = v.id;
  return true;
end; $function$;

-- 2. ---------------------------------------------------------------------------
-- Step-8 contract e-signature (anon, token-gated). Signs the contract already
-- stored on the session (148). No-op false if there is no contract to sign.
create or replace function public.sign_onboarding_contract(p_token uuid, p_signature text)
 returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare v record; sig text := btrim(coalesce(p_signature, ''));
begin
  if sig = '' then return false; end if;
  select * into v from public.mosque_staff_onboarding_sessions where token = p_token for update;
  if not found or v.token_expires_at < now()
     or v.status not in ('in_progress','changes_requested') then return false; end if;
  if v.contract is null then return false; end if;  -- nothing to sign

  update public.mosque_staff_onboarding_sessions set
    contract = jsonb_set(
                 jsonb_set(v.contract, '{signature}', to_jsonb(sig), true),
                 '{signed_at}', to_jsonb(now()), true),
    contract_signed    = true,
    contract_signed_at = now(),
    step_completed     = greatest(step_completed, 8)
  where id = v.id;
  return true;
end; $function$;

grant execute on function public.sign_onboarding_contract(uuid, text)
  to anon, authenticated, service_role;

-- 3. ---------------------------------------------------------------------------
drop function if exists public.get_onboarding_session_by_token(uuid);

create function public.get_onboarding_session_by_token(p_token uuid)
returns table(
  employee_name text, employee_email text, mosque_name text, path text,
  step_completed integer, status text, review_notes text,
  personal_details jsonb, rtw_details jsonb, dbs_details jsonb,
  employment_details jsonb, tax_details jsonb,
  bank_details_saved boolean, ni_saved boolean,
  contract jsonb,
  medical_questionnaire jsonb, safer_recruitment_declared boolean, dbs_consent_given boolean,
  address_history jsonb, availability_days text[], availability_notes text, contract_signed boolean
)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v record;
begin
  select s.*, m.name as mosque_name into v
    from public.mosque_staff_onboarding_sessions s
    join public.mosques m on m.id = s.mosque_id
   where s.token = p_token;
  if not found then return; end if;
  if v.token_expires_at < now() then return; end if;
  if v.status not in ('in_progress','changes_requested') then return; end if;

  return query select
    v.employee_name, v.employee_email, v.mosque_name, v.path, v.step_completed, v.status, v.review_notes,
    (v.personal_details - 'ni_number'),   -- strip NI
    v.rtw_details, v.dbs_details, v.employment_details, v.tax_details,
    (v.bank_details is not null and v.bank_details <> '{}'::jsonb),
    (coalesce(v.personal_details->>'ni_number','') <> ''),
    v.contract,
    v.medical_questionnaire, v.safer_recruitment_declared, v.dbs_consent_given,
    v.address_history, v.availability_days, v.availability_notes, v.contract_signed;
end; $function$;

grant execute on function public.get_onboarding_session_by_token(uuid)
  to anon, authenticated, service_role;

-- 4. ---------------------------------------------------------------------------
-- Verbatim from the live definition, with ONLY the availability_days/notes
-- promotion added to the mosque_staff UPDATE (marked below).
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
    -- RBAC-E: promote the wizard's availability into mosque_staff (146 cols).
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

-- APPLY CHECKLIST:
--   1. Dev: node scripts/pg-dev.mjs -f migrations/150_...sql  (after 149)
--   2. Probe: all four functions present; get_onboarding_session_by_token
--      return signature includes the new columns; anon can execute the two
--      token RPCs; a save→sign→read round-trip returns the projected columns.
