-- STATUS: Superseded by 028
-- Already applied: TBD (Session K Phase 2)
--
-- =============================================================================
-- SUPERSEDED BY 028 — file authored but never applied to prod.
-- pg_policies probe at K-7 pre-flight (8 May 2026) confirmed neither admin
-- SELECT nor admin UPDATE policy on scholars existed. Restored via 028
-- Part A using identical policy names + DDL. File retained as historical
-- record. STATUS line above updated accordingly.
-- =============================================================================
--
-- Adds admin-aware RLS policies to scholars. Additive only. Pre-K
-- the table had:
--   - "Public select active scholars" using (status='active')
--     (anon + authenticated)
--   - "Scholars read their own listing" using (user_id=auth.uid())
--     (authenticated, from migration 016)
--   - No INSERT/UPDATE policies (scholar profile editing not yet
--     built; the application-approval trigger inserts via
--     SECURITY DEFINER and bypasses RLS)
--
-- Phase 2 verification UI needs admin to:
--   - SELECT scholars with status='pending_verification' that
--     don't belong to the admin (today's policies hide them)
--   - UPDATE the three verified flags + status on the same rows
--
-- Without these policies, getScholarById() against a pending
-- listing silently returns null for an admin (RLS denies).
-- Symptom would be: open an approved application's detail view,
-- verification panel never loads.

create policy "Admins read all scholars"
  on scholars for select
  to authenticated
  using (public.is_admin());

create policy "Admins update all scholars"
  on scholars for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
