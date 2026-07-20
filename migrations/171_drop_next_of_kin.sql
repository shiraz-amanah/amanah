-- Migration 171: drop next_of_kin (redundant with emergency_contact_name/_phone)
-- Prod probe: 2 rows, 0 populated. Caller audit clean (Personal panel only).
-- Live-function sweep: only get_staff_sensitive + anonymise_staff reference it.
-- Order: recreate both functions without the column FIRST, then drop.

-- 1/3: get_staff_sensitive without next_of_kin
create or replace function public.get_staff_sensitive(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_result jsonb; v_mosque uuid;
begin
  select s.mosque_id, jsonb_build_object(
      'date_of_birth', e.dob,
      'phone', s.phone,
      'address', e.address,
      'nationality', e.nationality,
      'emergency_contact_name', e.emergency_contact_name,
      'emergency_contact_phone', e.emergency_contact_phone,
      'ni_number_masked', mask_ni(e.ni_number),
      'rtw_document_number', e.rtw_document_number,
      'dbs_certificate_number', e.dbs_certificate_number
    ) into v_mosque, v_result
    from mosque_staff s
    left join mosque_staff_employment e on e.staff_id = s.id
    join mosques m on m.id = s.mosque_id
    where s.id = p_staff_id and m.user_id = v_uid;
  if v_mosque is null then raise exception 'not_mosque_owner'; end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action)
    values (v_mosque, v_uid, p_staff_id, 'sensitive_data_viewed');
  return v_result;
end; $function$;

-- 2/3: anonymise_staff without next_of_kin
create or replace function public.anonymise_staff(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid;
begin
  select mosque_id into v_mosque from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque and user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;
  update mosque_staff set
    name = '[REDACTED]', email = '[REDACTED]', phone = '[REDACTED]',
    bio = null, dbs_certificate = '[REDACTED]'
  where id = p_staff_id;
  update mosque_staff_employment set
    dob = null, address = '[REDACTED]', ni_number = '[REDACTED]',
    bank_account_name = '[REDACTED]', bank_sort_code = '[REDACTED]',
    bank_account_number = '[REDACTED]',
    nationality = '[REDACTED]',
    emergency_contact_name = '[REDACTED]', emergency_contact_phone = '[REDACTED]',
    rtw_document_number = '[REDACTED]', rtw_share_code = '[REDACTED]',
    dbs_certificate_number = '[REDACTED]', dbs_id_document_number = '[REDACTED]',
    reference_1_name = '[REDACTED]', reference_1_email = '[REDACTED]',
    reference_2_name = '[REDACTED]', reference_2_email = '[REDACTED]'
  where staff_id = p_staff_id;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action)
    values (v_mosque, v_uid, p_staff_id, 'staff_anonymised');
end; $function$;

-- 3/3: drop the column
alter table public.mosque_staff_employment drop column next_of_kin;
