-- Migration 169: approve_onboarding_session — persist pay, non-destructive upsert
-- Fixes:
--  (a) pay never persisted: now writes salary_pence, hourly_rate_pence
--  (b) jsonb key mismatch: reads employment_type with contract_type fallback
--  (c) legacy salary_rate removed from INSERT + on-conflict (was always null,
--      and its on-conflict line destroyed admin-set values)
--  (d) on-conflict nulling bug: all updates now coalesce(excluded, existing)

create or replace function public.approve_onboarding_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
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
    contract_type, hours_per_week,
    salary_pence, hourly_rate_pence,
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
    coalesce(nullif(emp->>'employment_type',''), nullif(emp->>'contract_type','')),
    nullif(emp->>'hours_per_week','')::numeric,
    nullif(emp->>'salary_pence','')::integer,
    nullif(emp->>'hourly_rate_pence','')::integer,
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
    ni_number  = coalesce(excluded.ni_number,  mosque_staff_employment.ni_number),
    dob        = coalesce(excluded.dob,        mosque_staff_employment.dob),
    address    = coalesce(excluded.address,    mosque_staff_employment.address),
    emergency_contact_name  = coalesce(excluded.emergency_contact_name,  mosque_staff_employment.emergency_contact_name),
    emergency_contact_phone = coalesce(excluded.emergency_contact_phone, mosque_staff_employment.emergency_contact_phone),
    bank_account_name   = coalesce(excluded.bank_account_name,   mosque_staff_employment.bank_account_name),
    bank_sort_code      = coalesce(excluded.bank_sort_code,      mosque_staff_employment.bank_sort_code),
    bank_account_number = coalesce(excluded.bank_account_number, mosque_staff_employment.bank_account_number),
    contract_type     = coalesce(excluded.contract_type,     mosque_staff_employment.contract_type),
    hours_per_week    = coalesce(excluded.hours_per_week,    mosque_staff_employment.hours_per_week),
    salary_pence      = coalesce(excluded.salary_pence,      mosque_staff_employment.salary_pence),
    hourly_rate_pence = coalesce(excluded.hourly_rate_pence, mosque_staff_employment.hourly_rate_pence),
    p46_statement     = coalesce(excluded.p46_statement,     mosque_staff_employment.p46_statement),
    student_loan      = excluded.student_loan,
    student_loan_plan = coalesce(excluded.student_loan_plan, mosque_staff_employment.student_loan_plan),
    dbs_check_type         = coalesce(excluded.dbs_check_type,         mosque_staff_employment.dbs_check_type),
    dbs_workforce_type     = coalesce(excluded.dbs_workforce_type,     mosque_staff_employment.dbs_workforce_type),
    dbs_id_document_type   = coalesce(excluded.dbs_id_document_type,   mosque_staff_employment.dbs_id_document_type),
    dbs_id_document_number = coalesce(excluded.dbs_id_document_number, mosque_staff_employment.dbs_id_document_number),
    dbs_ucheck_reference   = coalesce(excluded.dbs_ucheck_reference,   mosque_staff_employment.dbs_ucheck_reference),
    dbs_certificate_number = coalesce(excluded.dbs_certificate_number, mosque_staff_employment.dbs_certificate_number),
    dbs_result_date        = coalesce(excluded.dbs_result_date,        mosque_staff_employment.dbs_result_date),
    dbs_checked_by         = coalesce(excluded.dbs_checked_by,         mosque_staff_employment.dbs_checked_by),
    rtw_check_type      = coalesce(excluded.rtw_check_type,      mosque_staff_employment.rtw_check_type),
    rtw_document_type   = coalesce(excluded.rtw_document_type,   mosque_staff_employment.rtw_document_type),
    rtw_document_number = coalesce(excluded.rtw_document_number, mosque_staff_employment.rtw_document_number),
    rtw_share_code      = coalesce(excluded.rtw_share_code,      mosque_staff_employment.rtw_share_code),
    rtw_check_date      = coalesce(excluded.rtw_check_date,      mosque_staff_employment.rtw_check_date),
    rtw_expiry_date     = coalesce(excluded.rtw_expiry_date,     mosque_staff_employment.rtw_expiry_date),
    rtw_checked_by      = coalesce(excluded.rtw_checked_by,      mosque_staff_employment.rtw_checked_by),
    updated_at = now();

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
