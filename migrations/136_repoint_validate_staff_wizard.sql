-- 136_repoint_validate_staff_wizard.sql
-- ====================================================================
-- Session RBAC-D — TOKEN CUTOVER. Repoint validate_staff_wizard off the
-- mosque_staff wizard-token stub and onto mosque_staff_onboarding_sessions (133).
--
-- The name AND output shape are preserved verbatim (valid, reason, staff_name,
-- mosque_name, staff_email) so send-transactional's onboarding_invite +
-- onboarding_reminder intents — which resolve the recipient server-side via this
-- RPC — need ZERO edits. This RPC's only remaining consumer is that email
-- resolution; the wizard landing page now hydrates via get_onboarding_session_by_token.
--
-- create-or-replace (return type unchanged) preserves the 066 anon+authenticated
-- grants. submit_staff_wizard (066) is now dead (replaced by submit_onboarding_
-- session) but left in place — dropping it is RBAC-E cleanup alongside the
-- wizard_* columns.
--
-- Session token is a uuid; compared as text against p_token (the invite bearer
-- string) so a non-uuid p_token can't raise a cast error — it just misses.
-- Reason mapping mirrors the old semantics: approved→'completed', past-expiry
-- →'expired', otherwise valid.
-- ====================================================================

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

  select s.employee_name as staff_name, s.employee_email as staff_email,
         s.status, s.token_expires_at, m.name as mosque_name
    into rec
    from public.mosque_staff_onboarding_sessions s
    join public.mosques m on m.id = s.mosque_id
   where s.token::text = p_token;

  if not found then
    return query select false, 'not_found'::text, null::text, null::text, null::text; return;
  end if;

  if rec.status = 'approved' then
    return query select false, 'completed'::text, rec.staff_name, rec.mosque_name, rec.staff_email; return;
  end if;

  if rec.token_expires_at < now() then
    return query select false, 'expired'::text, rec.staff_name, rec.mosque_name, rec.staff_email; return;
  end if;

  return query select true, null::text, rec.staff_name, rec.mosque_name, rec.staff_email;
end;
$$;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod — Supabase SQL editor):
--   1. Run this file.
--   2. Probe (RAW):
--        select proname, prosecdef from pg_proc where proname='validate_staff_wizard';  -- t
--        select valid, reason from public.validate_staff_wizard('nope');  -- (false, not_found)
--        -- with a real in_progress session token T:
--        select valid, reason, staff_name, mosque_name, staff_email
--          from public.validate_staff_wizard('<T>');  -- (true, null, name, mosque, email)
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
