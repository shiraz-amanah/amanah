-- 140_onboarding_full_ambiguous_id_fix.sql
-- ====================================================================
-- Session RBAC-D — FIX get_onboarding_session_full: "column reference id is
-- ambiguous" (SQLSTATE 42702). The function RETURNS TABLE (id uuid, ...), so
-- `id` is an output variable; the body's initial lookup did an UNQUALIFIED
-- `where id = p_session_id`, which Postgres can't disambiguate between that
-- variable and mosque_staff_onboarding_sessions.id. It threw BEFORE the owner
-- guard and BEFORE the audit insert (so no onboarding_sensitive_viewed row).
--
-- WHY IT SHIPPED: plpgsql RETURNS TABLE output columns SHADOW table columns. An
-- unqualified `where id = ...` against such a function throws 42702 at RUNTIME
-- only — it PASSES every CREATE-time probe (prosecdef, grants, column list), so
-- nothing caught it until a real owner opened a submission. Alias + qualify
-- every reference to prevent the whole class.
--
-- Fix: alias the table and qualify the reference (s.id) — explicit beats the
-- #variable_conflict pragma. This is the ONLY 133 RPC affected: it's the only
-- RETURNS TABLE function that references one of its own output-column names
-- unqualified. get_onboarding_sessions_for_mosque returns a table too but
-- qualifies everything (s.*). The boolean-returning RPCs (save/submit/approve/
-- request_onboarding_changes) have NO output-column variables, so their
-- unqualified `where id = ...` refs resolve unambiguously to the column — audited
-- and left as-is.
--
-- create-or-replace (signature + return type unchanged) preserves the 133 grants.
-- ====================================================================

create or replace function public.get_onboarding_session_full(p_session_id uuid)
returns table (
  id uuid, mosque_id uuid, staff_id uuid, employee_name text, employee_email text,
  path text, status text, step_completed int, review_notes text,
  personal_details jsonb, rtw_details jsonb, dbs_details jsonb,
  employment_details jsonb, tax_details jsonb, bank_details jsonb,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer volatile set search_path = public as $$
declare v record;
begin
  select s.* into v
    from public.mosque_staff_onboarding_sessions s
   where s.id = p_session_id;
  if not found then raise exception 'not_found'; end if;
  if not owns_onboarding_mosque(v.mosque_id) then raise exception 'not_authorised'; end if;

  insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v.mosque_id, auth.uid(), v.staff_id, 'onboarding_sensitive_viewed',
            jsonb_build_object('session_id', v.id));

  return query select
    v.id, v.mosque_id, v.staff_id, v.employee_name, v.employee_email, v.path, v.status,
    v.step_completed, v.review_notes,
    v.personal_details, v.rtw_details, v.dbs_details, v.employment_details,
    v.tax_details, v.bank_details, v.created_at, v.updated_at;
end; $$;

notify pgrst, 'reload schema';

-- Probe on dev (RAW) — as the mosque OWNER (authed), with a submitted session id S:
--   select id, employee_name, bank_details is not null as has_bank
--     from public.get_onboarding_session_full('<S>');   -- returns the row, no 42702
--   select action from public.mosque_staff_audit_log
--     where action='onboarding_sensitive_viewed' order by created_at desc limit 1;  -- one fresh row
