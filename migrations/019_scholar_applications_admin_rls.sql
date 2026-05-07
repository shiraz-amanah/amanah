-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 2)
--
-- Adds admin-aware RLS policies to scholar_applications. Additive
-- only — the existing 015 open policies ("Authenticated read all
-- applications", "Authenticated update applications") stay in
-- place, so behaviour for non-admin users is unchanged. PostgREST
-- ORs USING clauses, so the admin policies don't restrict anyone.
--
-- The admin policies establish the pattern for a future tightening
-- pass (parked in NOTES.md) where:
--   - "Authenticated read all applications" → DROP, replaced by
--     "Users read own applications" (user_id = auth.uid()) +
--     these admin policies.
--   - "Authenticated update applications" → DROP, replaced by
--     these admin policies (admins are the only ones who flip
--     status; users insert via the wizard).
--
-- Until that tightening lands, these policies are effectively a
-- no-op behaviourally but document intent and unlock per-table
-- audit ("which tables have admin-aware RLS today?").

create policy "Admins read all scholar applications"
  on scholar_applications for select
  to authenticated
  using (public.is_admin());

create policy "Admins update all scholar applications"
  on scholar_applications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
