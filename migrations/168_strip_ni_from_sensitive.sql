-- 168_strip_ni_from_sensitive.sql
-- ====================================================================
-- SECURITY: remove PLAINTEXT ni_number from get_staff_sensitive (129).
--
-- Background: D3 (migration 166) added get_staff_ni — an owner-only reveal
-- audited as its own action ('ni_number_viewed'). But get_staff_sensitive was
-- ALSO still handing the owner the plaintext NI inside its broad bundle
-- (audited only as the generic 'sensitive_data_viewed'), so the D3 mask was a
-- UI control rather than a transport barrier: the plaintext reached the browser
-- before anyone clicked Reveal.
--
-- OPTION A (Shiraz's call): the key is NOT simply dropped. An audit of the
-- callers found StaffProfile.jsx reads sensitive.ni_number at THREE sites —
-- the edit-form placeholder (581), the existence gate (1018) and the mask value
-- (1021). A bare removal would leave the gate seeing undefined, render "—", and
-- never mount the "Reveal — logged" button — silently making get_staff_ni
-- unreachable from the UI and deleting the feature with no error.
--
-- So plaintext 'ni_number' is REPLACED by 'ni_number_masked', masked SERVER-SIDE.
-- The browser keeps exactly enough to render QQ•••••••C and to know an NI is on
-- file; the plaintext is now obtainable ONLY through get_staff_ni, which audits
-- every reveal. Same shape as the bank precedent (161 get_staff_bank_masked +
-- the mask_bank_* helpers in 159).
--
-- No RLS change. No table DDL. get_staff_ni (166) is deliberately UNTOUCHED —
-- P3 re-verifies it as a regression check.
-- ====================================================================

begin;

-- Server-side NI mask. Mirrors the client maskNi() in StaffProfile.jsx: strip
-- whitespace, keep the leading pair + the suffix letter, fixed 7 bullets. NI is
-- fixed-width (2 letters + 6 digits + 1 letter) so this leaks nothing beyond
-- "an NI is on file". IMMUTABLE — pure function of its input.
create or replace function public.mask_ni(p_ni text)
returns text language sql immutable as $$
  with s as (select regexp_replace(coalesce(p_ni, ''), '\s', '', 'g') as v)
  select case
    when nullif(v, '') is null then null
    else left(v, 2) || '•••••••' || case when length(v) > 2 then right(v, 1) else '' end
  end
  from s;
$$;

revoke all on function public.mask_ni(text) from public, anon;
grant execute on function public.mask_ni(text) to authenticated;

-- Same body as 129 except the plaintext NI key is replaced by the masked one.
-- Owner-only gate, audit row and every other key are unchanged.
-- NOTE: no inline comment naming the OLD key is kept inside the function body —
-- pg_get_functiondef returns comments verbatim, so such a comment makes a
-- textual "is the plaintext gone?" probe match its own documentation (it did,
-- on the first run of behcheck-168-dev).
create or replace function public.get_staff_sensitive(p_staff_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_result jsonb; v_mosque uuid;
begin
  select s.mosque_id, jsonb_build_object(
      'date_of_birth', e.dob,
      'phone', s.phone,
      'address', e.address,
      'nationality', e.nationality,
      'next_of_kin', e.next_of_kin,
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
end; $$;

-- CREATE OR REPLACE preserves existing privileges; re-asserted for clarity and
-- to match the 163 tightening (default PUBLIC EXECUTE is not relied on).
revoke all on function public.get_staff_sensitive(uuid) from public, anon;
grant execute on function public.get_staff_sensitive(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- CLIENT CHANGES REQUIRED WITH THIS MIGRATION (not optional — see above):
--   StaffProfile.jsx 581  -> sensitive?.ni_number_masked
--   StaffProfile.jsx 1018 -> !sensitive.ni_number_masked
--   StaffProfile.jsx 1021 -> {sensitive.ni_number_masked}   (drop the maskNi call)
--   StaffProfile.jsx ~730 -> post-save merge stores the MASKED form
--   maskNi() in StaffProfile.jsx becomes dead — remove it.
--
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-168-dev.mjs, then STOP):
--   P1  pg_get_functiondef: 'ni_number' absent, 'ni_number_masked' present.
--   P2  owner call: jsonb has NO ni_number key; the other 9 keys present;
--       masked value is QQ•••••••C for QQ123456C.
--   P3  REGRESSION: get_staff_ni still returns the plaintext correctly.
--   Then STOP for prod approval.
-- ====================================================================
