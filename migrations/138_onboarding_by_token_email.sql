-- 138_onboarding_by_token_email.sql
-- ====================================================================
-- Session RBAC-D — add employee_email to get_onboarding_session_by_token's
-- output so the wizard can (a) fire the "submitted" confirmation email to the
-- employee and (b) show who the onboarding is for. This is the token-HOLDER's
-- OWN email — same anon-safe posture as validate_staff_wizard returning
-- staff_email (066): the caller already holds the secret token, so it's no new
-- leak. bank_details is STILL never returned; NI is STILL stripped.
--
-- Return type changes (new column) → DROP then CREATE (create-or-replace can't
-- alter a function's return type). Re-grant + same harvest guard as 133.
--
-- LOAD-BEARING: DROP FUNCTION also drops its grants, so the grant statements at
-- the foot are NOT decorative — without them the RPC reverts to owner-only
-- default and the anon wizard landing page 403s. Anyone splitting/reordering
-- this file must keep the re-grant paired with the recreate.
-- ====================================================================

drop function if exists public.get_onboarding_session_by_token(uuid);

create function public.get_onboarding_session_by_token(p_token uuid)
returns table (
  employee_name text, employee_email text, mosque_name text, path text,
  step_completed int, status text, review_notes text,
  personal_details jsonb, rtw_details jsonb, dbs_details jsonb,
  employment_details jsonb, tax_details jsonb,
  bank_details_saved boolean, ni_saved boolean
)
language plpgsql security definer stable set search_path = public as $$
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
    (coalesce(v.personal_details->>'ni_number','') <> '');
end; $$;

revoke all on function public.get_onboarding_session_by_token(uuid) from public;
grant execute on function public.get_onboarding_session_by_token(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
