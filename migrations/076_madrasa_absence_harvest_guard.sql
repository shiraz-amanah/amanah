-- 076_madrasa_absence_harvest_guard.sql
-- ====================================================================
-- Fix for the harvest guard in 075 (caught by the Phase 2b smoke — an
-- authenticated parent could still call madrasa_absences_to_notify and read
-- another family's resolved email).
--
-- 075 did `revoke all ... from public`, but Supabase grants EXECUTE on public
-- functions to the `anon` and `authenticated` roles EXPLICITLY (not via PUBLIC),
-- so revoking from PUBLIC alone left those grants in place. Because the
-- functions are SECURITY DEFINER, any authenticated caller got definer-resolved
-- rows — including parent emails. Revoke EXECUTE from anon + authenticated
-- explicitly; only service_role (the serverless function) may call them.
-- ====================================================================

revoke execute on function public.madrasa_consecutive_absences(uuid, uuid, date) from anon, authenticated;
revoke execute on function public.madrasa_absences_to_notify(uuid, date)         from anon, authenticated;
revoke execute on function public.madrasa_claim_absence_notification(uuid)        from anon, authenticated;

-- service_role grants from 075 stand; re-assert idempotently for clarity.
grant execute on function public.madrasa_consecutive_absences(uuid, uuid, date) to service_role;
grant execute on function public.madrasa_absences_to_notify(uuid, date)         to service_role;
grant execute on function public.madrasa_claim_absence_notification(uuid)        to service_role;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe — as an authenticated (non-service) client:
--        rpc madrasa_absences_to_notify → permission denied (was: rows).
--      service_role / serverless call still works.
--   3. Re-run scripts/smoke-madrasa-2b-absence.mjs → 7/7.
--   4. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';
