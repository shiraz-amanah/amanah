-- 178_tighten_suspend_staff_grants.sql
-- ====================================================================
-- Tightens suspend_staff's EXECUTE grants to `authenticated`, matching
-- the pattern 175 applied to get_mosque_staff_list and 177 applied to
-- log_erasure_register_export.
--
-- GRANTS ONLY. The function body is NOT touched — no CREATE, no REPLACE,
-- so `md5(prosrc)` must be UNCHANGED after this runs. That is the point
-- of keeping it a grants-only file: the verification is a grants query,
-- and the hash staying still is itself a check that nothing else moved.
--
-- WHY. Postgres grants EXECUTE to PUBLIC by default, so suspend_staff was
-- callable by `anon`. Found while forcing a failure for the bulk-deactivate
-- probe: revoking EXECUTE from `authenticated` changed nothing, because the
-- PUBLIC grant kept it working.
--
-- NOT A VULNERABILITY, A HARDENING. suspend_staff is SECURITY DEFINER and
-- checks mosque ownership against auth.uid(); for an anon caller auth.uid()
-- is null, so the ownership check already refuses. This removes the
-- reachability rather than fixing an exploit — an anon caller should not be
-- able to invoke a staff-mutating function at all, even to be rejected by it.
--
-- RISK: this is the one change that could break the HAPPY path — an owner
-- calls this through PostgREST as `authenticated`, so the grant must land on
-- that role and only that role. Verified by usage on dev in both directions
-- (owner still succeeds; anon refused at the grant layer, before the
-- ownership check) rather than by reading the grant table alone.
-- ====================================================================

revoke all on function public.suspend_staff(uuid, text) from public, anon;
grant execute on function public.suspend_staff(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Probe after applying (dev then prod):
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name = 'suspend_staff'
--    order by grantee;
--   -- expect authenticated / postgres / service_role; anon and PUBLIC ABSENT
--
--   select md5(p.prosrc), length(p.prosrc)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'suspend_staff';
--   -- expect UNCHANGED — this migration alters no function body.
