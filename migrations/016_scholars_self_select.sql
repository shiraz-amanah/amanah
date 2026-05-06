-- STATUS: Verbatim
-- Already applied: 7 May 2026 (Session J follow-up).
--
-- Adds a self-SELECT RLS policy on scholars so a user with a row in
-- scholars where user_id = auth.uid() can read it regardless of
-- status. The existing public SELECT policy on scholars (TODO: not
-- captured in migrations/, but inferred from getScholars + the
-- listings filter behaviour) is `using (status = 'active')` — which
-- correctly hides pending_verification scholars from public listings
-- but ALSO hid them from the scholar's own view.
--
-- Symptom that surfaced this: an approved scholar (test2) had a
-- scholars row with status='pending_verification', but
-- getScholarByUserId returned null because RLS filtered it out.
-- routeAuthedScholar then fell through to the application branch
-- and showed scholarApplicationSubmitted instead of
-- scholarVerificationPending. Same code path will break the rest
-- of the dashboard once the scholar is active anyway — own-row
-- self-select is a baseline correctness requirement.
--
-- Additive only: PostgREST ORs USING clauses for SELECT, so this
-- doesn't weaken the public-listing filter for non-active scholars.

create policy "Scholars read their own listing"
  on scholars for select
  to authenticated
  using (user_id = auth.uid());
