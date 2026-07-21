-- 177_log_erasure_register_export.sql
-- ====================================================================
-- Lets an owner record that they exported the erasure register.
--
-- WHY AN RPC AND NOT A CLIENT INSERT. mosque_staff_audit_log carries
-- SELECT policies only ("Owner reads staff audit" / "Admin reads staff
-- audit", migration 129) — there is no INSERT policy, so RLS blocks a
-- client write outright. Every existing write to this table happens
-- inside a SECURITY DEFINER function, and this follows that pattern
-- rather than opening an INSERT policy: a policy would let a client
-- forge ANY action string on this table, including 'staff_anonymised',
-- which is the row the erasure register itself is built from.
--
-- WHY LOG AT ALL. The register is a compliance artefact — it is produced
-- in response to an ICO or audit request. Who produced one, and when, is
-- part of what makes it defensible.
--
-- WHAT IS RECORDED: format and row count. NEVER the exported content.
-- The register deliberately contains no personal data (staff_id, erased
-- timestamp, acting owner — no name, email or role), and the audit row
-- must not become the place that personal data reappears.
--
-- staff_id IS NULL on purpose: the export concerns the register as a
-- whole, not one person. The column is nullable and migration 157's
-- permissions-only audit rows already set it null, so this is an
-- established shape, not a new one.
--
-- SCHEMA FACTS CHECKED AGAINST DEV BEFORE WRITING THIS (not assumed):
--   * action is `text NOT NULL` with NO check constraint, so a new
--     action value needs no constraint change.
--   * actor_id and staff_id are both nullable.
--   * is_admin() exists.
--
-- GRANTS ARE EXPLICITLY TIGHTENED to authenticated, matching the pattern
-- 175 applied to get_mosque_staff_list. Postgres grants EXECUTE to PUBLIC
-- by default, which is how suspend_staff ended up callable by anon — an
-- inconsistency logged in NOTES. New functions should not repeat it.
-- ====================================================================

create or replace function public.log_erasure_register_export(
  p_mosque_id uuid,
  p_format text,
  p_row_count integer
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if not exists (select 1 from mosques where id = p_mosque_id and user_id = v_uid)
     and not is_admin() then
    raise exception 'not_mosque_owner';
  end if;
  -- Constrain the recorded format so the audit trail cannot be seeded with
  -- arbitrary caller-supplied text.
  if p_format is null or p_format not in ('csv', 'pdf') then
    raise exception 'invalid_format';
  end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
  values (p_mosque_id, v_uid, null, 'erasure_register_exported',
          jsonb_build_object('format', p_format,
                             'row_count', greatest(coalesce(p_row_count, 0), 0)));
end; $function$;

revoke all on function public.log_erasure_register_export(uuid, text, integer) from public, anon;
grant execute on function public.log_erasure_register_export(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';

-- Probe after applying (dev then prod):
--   select md5(p.prosrc), length(p.prosrc)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'log_erasure_register_export';
--
--   select grantee from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name = 'log_erasure_register_export';
--   -- expect authenticated present, anon and PUBLIC ABSENT
--
-- Behaviour to verify by usage, not shape:
--   * a non-owner call raises not_mosque_owner and writes NO row;
--   * an unknown format raises invalid_format and writes NO row;
--   * getErasureRegister still returns only 'staff_anonymised' rows, i.e.
--     export rows do not leak into the register they describe.
