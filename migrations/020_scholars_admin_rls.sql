-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 2)
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
