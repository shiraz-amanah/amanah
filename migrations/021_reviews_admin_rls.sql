-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 3)
--
-- Adds admin-aware RLS policies to reviews. Additive — the existing
-- 012 policies stay in place. PostgreSQL OR-combines policies for
-- the same cmd, so:
--
--   SELECT: any policy returning true grants visibility.
--     - "Anyone reads published reviews"  → published rows
--     - "Users read their own reviews"    → own rows (any status)
--     - "Admins read all reviews" (NEW)   → all rows for admins
--
--   UPDATE: any (USING, WITH CHECK) pair where both are true allows.
--     - "Users update own reviews"           USING: parent_id = uid
--                                            CHECK: parent_id = uid AND status='published'
--                                            → users can edit body/rating but not flip status away
--     - "Admins update review status" (NEW)  USING: is_admin()
--                                            CHECK: is_admin()
--                                            → admins flip any column on any row
--
-- Pre-021, AdminReviewsModeration's hide/publish UI was a silent
-- no-op against prod data: getReviewsForModeration filtered to
-- published-only (the only rows visible) and setReviewStatus's
-- UPDATE was denied by RLS. Caught during Session-K Phase-3
-- recon by reading pg_policies directly. Documented in NOTES.md.

create policy "Admins read all reviews"
  on reviews for select
  to authenticated
  using (public.is_admin());

create policy "Admins update review status"
  on reviews for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
