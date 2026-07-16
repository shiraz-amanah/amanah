-- 148_onboarding_session_contract.sql
-- ====================================================================
-- Session RBAC-E Part 1 — Commit 2. Store the auto-generated employment
-- contract on the onboarding session so the remote wizard can display it for
-- signature at Step 8 (Commit 3).
--
--   contract jsonb = {
--     template_id, employment_type,
--     fields:{...prefilled contract data...},
--     rendered_html,
--     signature, signed_at        -- signature added at wizard Step 8
--   }
--
-- The owner (mosque admin) writes it via a direct RLS-guarded UPDATE from the
-- client (auth.js setOnboardingSessionContract) — the "Owner manages onboarding
-- sessions" ALL policy from 133 already permits it, so no new RPC for the write.
--
-- get_onboarding_session_by_token is extended to RETURN contract so the anon,
-- token-gated wizard can read it at Step 8. Contract = employment terms, NOT
-- special-category data, so returning it to the token-holder (the employee
-- themselves) is appropriate. NI stays stripped; nothing else in the RPC
-- changes. Return type changes → DROP + recreate + re-GRANT (acl replicated).
--
-- 055 email invariant: untouched — no email column read or written here.
-- ====================================================================

begin;

alter table public.mosque_staff_onboarding_sessions
  add column if not exists contract jsonb;

drop function if exists public.get_onboarding_session_by_token(uuid);

create function public.get_onboarding_session_by_token(p_token uuid)
returns table(
  employee_name text, employee_email text, mosque_name text, path text,
  step_completed integer, status text, review_notes text,
  personal_details jsonb, rtw_details jsonb, dbs_details jsonb,
  employment_details jsonb, tax_details jsonb,
  bank_details_saved boolean, ni_saved boolean,
  contract jsonb
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
    v.contract;
end; $function$;

-- Replicate the pre-drop ACL: {anon,authenticated,service_role} = EXECUTE.
grant execute on function public.get_onboarding_session_by_token(uuid)
  to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- APPLY CHECKLIST:
--   1. Dev: node scripts/pg-dev.mjs -f migrations/148_...sql
--   2. Probe: contract column exists; RPC return signature includes contract;
--      RPC still callable by anon (acl includes anon=X).
