-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 1)
--
-- Seeds the initial admin user. shiraz@savecobradford.co.uk is the
-- founder and only admin at K-launch. Additional admins are added
-- after launch by either:
--   (a) extending the email list in this file and re-running, or
--   (b) running an ad-hoc UPDATE against profiles for the new
--       admin's email after they've signed up via the normal flow.
--
-- The UPDATE is idempotent — re-running is safe, no duplicate rows.
-- It assumes the profiles row already exists (i.e. the user has
-- signed up at least once). If shiraz hasn't signed up yet at apply
-- time, this is a no-op and the email above needs to sign up first,
-- then re-run this file.

update profiles
set role = 'admin'
where email = 'shiraz@savecobradford.co.uk';

-- Verification query — run separately after applying:
--   select id, email, role from profiles where role = 'admin';
-- Expect exactly one row.
