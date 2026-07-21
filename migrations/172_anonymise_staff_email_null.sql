-- 172_anonymise_staff_email_null.sql
-- ====================================================================
-- GDPR right-to-erasure repair. anonymise_staff has been DEAD since
-- migration 134 — every invocation raises 23514 and redacts nothing.
--
-- The collision: 129 wrote `email = '[REDACTED]'` into the mosque_staff
-- UPDATE. 134 later added the mosque_staff_email_format CHECK
--   (email IS NULL OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
-- 134 did not touch 129's function, so nothing flagged the conflict.
-- '[REDACTED]' has no '@' and is not NULL, so it fails the regex. The
-- constraint is NOT VALID, which skips pre-existing rows but STILL
-- enforces on every UPDATE — so the erasure raises.
--
-- Blast radius was total, not partial: the mosque_staff UPDATE is the
-- first statement after the ownership gate, so it aborted the function
-- before the mosque_staff_employment redaction AND before the
-- 'staff_anonymised' audit insert. Nothing was redacted and no audit
-- trace of the attempt was written.
--
-- WHY NULL AND NOT A DIFFERENT SENTINEL (e.g. 'redacted@example.invalid'):
-- mosque_staff.email is not merely display PII — it is a JOIN KEY.
-- accept_staff_invite (migration 055) links an accepting account to a
-- pre-existing directory row by `lower(mosque_staff.email) =
-- lower(inv.invitee_email)`, and on a MISS it falls through and INSERTs a
-- duplicate row. A shared sentinel string across many anonymised rows is
-- therefore a live false-link hazard: a future invite-accept could match
-- an erased record. NULL cannot — `lower(null) = lower(x)` evaluates to
-- NULL, never true, so a NULLed row is permanently unmatchable by 055.
-- NULL also passes 134's CHECK explicitly (`email IS NULL OR ...`), and
-- the column is already nullable (in-house staff may have no email).
--
-- Body is otherwise IDENTICAL to the current live 171 definition
-- (verified md5(prosrc) = 770cf7fc8b0d8b5a437503a9e80da2e7 on BOTH dev
-- and prod). Only the single `email` assignment changes. No signature
-- change, so existing grants survive CREATE OR REPLACE — no re-grant
-- needed here.
-- ====================================================================

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
    name = '[REDACTED]', email = null, phone = '[REDACTED]',
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

notify pgrst, 'reload schema';

-- Probe after applying (dev then prod) — the body must no longer contain
-- the '[REDACTED]' email literal:
--   select md5(p.prosrc), length(p.prosrc)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'anonymise_staff';
--
-- Usage verification (NOT shape): run the real erasure from the staff
-- profile UI against a disposable dev staff row, then confirm all three
-- effects landed — the pre-172 defect produced zero of them:
--   select email, name, phone from mosque_staff where id = '<staff-id>';
--     -- expect email IS NULL, name/phone '[REDACTED]'
--   select ni_number, bank_account_number from mosque_staff_employment
--    where staff_id = '<staff-id>';                 -- expect '[REDACTED]'
--   select action from mosque_staff_audit_log
--    where staff_id = '<staff-id>' and action = 'staff_anonymised';
