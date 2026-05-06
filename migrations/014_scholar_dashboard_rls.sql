-- STATUS: Verbatim
-- Already applied: 7 May 2026 (NOTES.md Session I).
--
-- Adds two RLS policies to bookings so scholars can read + update
-- their own booking rows. Pre-Session-I, only parent-side policies
-- existed; scholars had no read/write access to bookings even on
-- their own listings.
--
-- Both policies are additive — they don't replace or weaken the
-- existing parent-side policies. PostgREST will apply the OR of all
-- matching USING clauses for SELECT (so a parent reading their own
-- booking still works), and per-policy WITH CHECK for UPDATE.
--
-- TRUST BOUNDARY: the UPDATE policy permits a scholar to update ANY
-- column on their own bookings, not just meeting_url. Column-level
-- restriction would need a function-based policy or column-level
-- GRANTs (more involved). For Session I we rely on the application
-- to only PATCH meeting_url from the scholar dashboard. The
-- helper auth.js#setBookingMeetingUrl is the single write path.
-- Promote to column-level enforcement before we add any other
-- scholar-side write surface (e.g. scholar-side cancel/reschedule).

-- Scholar can SELECT rows for their own scholar listing.
create policy "Scholars read own bookings"
  on bookings for select
  to authenticated
  using (
    scholar_id in (
      select id from scholars where user_id = auth.uid()
    )
  );

-- Scholar can UPDATE rows for their own scholar listing.
-- WITH CHECK matches USING — scholar can't reassign a booking to
-- a different scholar via update.
create policy "Scholars update own bookings"
  on bookings for update
  to authenticated
  using (
    scholar_id in (
      select id from scholars where user_id = auth.uid()
    )
  )
  with check (
    scholar_id in (
      select id from scholars where user_id = auth.uid()
    )
  );
