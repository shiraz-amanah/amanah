-- 066_staff_wizard_rpcs.sql
-- ====================================================================
-- Session W — remote staff onboarding ("Send to staff member"). The admin
-- creates a stub mosque_staff row with a random wizard_token (raw, matching
-- the existing invite-token posture — uuid string in the text column) and a
-- 7-day expiry, then emails the staff member a link. The staff member opens
-- the link (NOT signed in) and completes the wizard. Because mosque_staff +
-- mosque_staff_employment are owner-only, the remote write goes through these
-- SECURITY DEFINER RPCs — the token is the authorisation, exactly like
-- accept_staff_invite (030). The RPC derives staff_id/mosque_id from the token
-- lookup, so a caller can only ever write the one record the token points at.
--
-- Document uploads are NOT part of the remote path: mosque-hr-docs is
-- owner-write, so the admin attaches DBS/RTW files afterwards.
-- ====================================================================

-- --------------------------------------------------------------------
-- validate_staff_wizard — anon-callable safe-shape preview for the
-- landing page. Never reveals whether a token exists beyond valid/reason.
-- --------------------------------------------------------------------
-- staff_email is returned so the send function (anon key + this RPC, mirroring
-- send-staff-invite) can email the recipient without the client supplying the
-- address. A caller already holds the secret token, so this is no new leak —
-- the same posture as validate_staff_invite returning invitee_email.
create or replace function public.validate_staff_wizard(p_token text)
returns table (
  valid boolean,
  reason text,
  staff_name text,
  mosque_name text,
  staff_email text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  rec record;
begin
  if p_token is null or length(p_token) < 10 then
    return query select false, 'not_found'::text, null::text, null::text, null::text; return;
  end if;

  select s.name as staff_name, s.email as staff_email, s.wizard_status,
         s.wizard_token_expires_at, m.name as mosque_name
    into rec
    from public.mosque_staff s
    join public.mosques m on m.id = s.mosque_id
   where s.wizard_token = p_token;

  if not found then
    return query select false, 'not_found'::text, null::text, null::text, null::text; return;
  end if;

  if rec.wizard_status = 'completed' then
    return query select false, 'completed'::text, rec.staff_name, rec.mosque_name, rec.staff_email; return;
  end if;

  if rec.wizard_token_expires_at is not null and rec.wizard_token_expires_at < now() then
    return query select false, 'expired'::text, rec.staff_name, rec.mosque_name, rec.staff_email; return;
  end if;

  return query select true, null::text, rec.staff_name, rec.mosque_name, rec.staff_email;
end;
$$;

revoke all on function public.validate_staff_wizard(text) from public;
grant execute on function public.validate_staff_wizard(text) to anon, authenticated;

-- --------------------------------------------------------------------
-- submit_staff_wizard — anon-callable (token-authorised). Re-validates the
-- token, then writes mosque_staff + upserts mosque_staff_employment from the
-- payload in one transaction, marks the wizard completed and burns the token
-- (one-time use). Fields are extracted EXPLICITLY — no arbitrary columns.
-- --------------------------------------------------------------------
create or replace function public.submit_staff_wizard(p_token text, p_payload jsonb)
returns table (ok boolean, reason text)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  rec record;
begin
  if p_token is null or length(p_token) < 10 then
    return query select false, 'not_found'::text; return;
  end if;

  select s.id as staff_id, s.mosque_id, s.wizard_status, s.wizard_token_expires_at
    into rec
    from public.mosque_staff s
   where s.wizard_token = p_token
   for update;

  if not found then
    return query select false, 'not_found'::text; return;
  end if;
  if rec.wizard_status = 'completed' then
    return query select false, 'completed'::text; return;
  end if;
  if rec.wizard_token_expires_at is not null and rec.wizard_token_expires_at < now() then
    return query select false, 'expired'::text; return;
  end if;

  -- mosque_staff: directory + lightweight status fields, complete the wizard,
  -- burn the token.
  update public.mosque_staff set
    name             = coalesce(nullif(p_payload->>'name', ''), name),
    role             = coalesce(nullif(p_payload->>'role', ''), role),
    phone            = nullif(p_payload->>'phone', ''),
    start_date       = nullif(p_payload->>'start_date', '')::date,
    dbs_status       = coalesce(nullif(p_payload->>'dbs_status', ''), 'not_checked'),
    dbs_certificate  = nullif(p_payload->>'dbs_certificate_number', ''),
    dbs_expiry_date  = nullif(p_payload->>'dbs_expiry_date', '')::date,
    wizard_status    = 'completed',
    wizard_token     = null,
    wizard_token_expires_at = null
  where id = rec.staff_id;

  -- mosque_staff_employment: owner-only sensitive detail (incl. bank).
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
    rec.staff_id, rec.mosque_id,
    nullif(p_payload->>'ni_number', ''), nullif(p_payload->>'dob', '')::date,
    nullif(p_payload->>'address', ''), nullif(p_payload->>'emergency_contact_name', ''),
    nullif(p_payload->>'emergency_contact_phone', ''),
    nullif(p_payload->>'bank_account_name', ''), nullif(p_payload->>'bank_sort_code', ''),
    nullif(p_payload->>'bank_account_number', ''),
    nullif(p_payload->>'contract_type', ''), nullif(p_payload->>'hours_per_week', '')::numeric,
    nullif(p_payload->>'salary_rate', ''),
    nullif(p_payload->>'p46_statement', ''), coalesce((p_payload->>'student_loan')::boolean, false),
    nullif(p_payload->>'student_loan_plan', ''),
    nullif(p_payload->>'dbs_check_type', ''), nullif(p_payload->>'dbs_workforce_type', ''),
    nullif(p_payload->>'dbs_id_document_type', ''), nullif(p_payload->>'dbs_id_document_number', ''),
    nullif(p_payload->>'dbs_ucheck_reference', ''), nullif(p_payload->>'dbs_certificate_number', ''),
    nullif(p_payload->>'dbs_result_date', '')::date, nullif(p_payload->>'dbs_checked_by', ''),
    nullif(p_payload->>'rtw_check_type', ''), nullif(p_payload->>'rtw_document_type', ''),
    nullif(p_payload->>'rtw_document_number', ''), nullif(p_payload->>'rtw_share_code', ''),
    nullif(p_payload->>'rtw_check_date', '')::date, nullif(p_payload->>'rtw_expiry_date', '')::date,
    nullif(p_payload->>'rtw_checked_by', '')
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

  return query select true, null::text;
end;
$$;

revoke all on function public.submit_staff_wizard(text, jsonb) from public;
grant execute on function public.submit_staff_wizard(text, jsonb) to anon, authenticated;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        select proname, prosecdef from pg_proc
--          where proname in ('validate_staff_wizard','submit_staff_wizard');
--        -- prosecdef = true (security definer) for both.
--        select valid, reason from public.validate_staff_wizard('nope');
--        -- expect (false, not_found)
--   3. End-to-end: create a mosque_staff row with a wizard_token + future
--      expiry, call validate (valid=true), call submit with a small payload,
--      confirm wizard_status='completed', wizard_token cleared, and the
--      employment row written.
--   4. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';
