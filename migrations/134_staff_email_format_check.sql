-- 134_staff_email_format_check.sql
-- ====================================================================
-- Session RBAC-D hardening — structural backstop for the 055 email-link
-- invariant. accept_staff_invite (055) links an accepting account to a
-- pre-existing directory row by lower(email) match; on a MISS it falls through
-- and INSERTs a duplicate. That is a FAIL-OPEN: junk in mosque_staff.email (or
-- the invite's invitee_email) silently produces a second staff row instead of a
-- link. Prod already carries 4 such rows (name/email TRANSPOSED — email holds a
-- name string), written by MosqueBulkImport, which validated only name+role and
-- never checked email format. RBAC-D re-surfaces that importer, so the guard
-- lands here too: a client-side regex is not a control — this CHECK is the
-- backstop that makes the invariant structural.
--
-- Both halves of the link get the same treatment: mosque_staff.email AND
-- mosque_staff_invites.invitee_email (the two columns 055 compares).
--
-- NOT VALID on purpose: it enforces on every NEW write immediately WITHOUT
-- failing on the pre-existing junk rows. Those 4 rows are cleaned separately
-- (SQL surfaced for review, run by hand). Only AFTER they're corrected/removed
-- on dev AND prod do we VALIDATE — that step is deliberately NOT in this file.
--
-- email is nullable on both columns (in-house staff may have none; the CHECK
-- allows null). Case-insensitive (~*), mirroring the AddStaffModal regex
-- (\S+@\S+\.\S+) that already gates the UI form paths.
-- ====================================================================

alter table public.mosque_staff
  add constraint mosque_staff_email_format
  check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  not valid;

alter table public.mosque_staff_invites
  add constraint mosque_staff_invites_invitee_email_format
  check (invitee_email is null or invitee_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  not valid;

notify pgrst, 'reload schema';

-- Probe after applying (dev then prod) — expect both constraints present, both
-- convalidated = FALSE (NOT VALID until the junk rows are cleaned + VALIDATEd):
--   select conname, convalidated
--     from pg_constraint
--    where conname in ('mosque_staff_email_format',
--                      'mosque_staff_invites_invitee_email_format');
--
-- Sanity — a junk write is now rejected (should raise 23514):
--   insert into public.mosque_staff (mosque_id, name, email, role, staff_type)
--   values ('<any-mosque-id>', 'x', 'not-an-email', 'Imam', 'permanent');
--
-- DEFERRED (NOT in this migration — surfaced separately for hand-review):
--   1. Clean the 4 transposed prod rows.
--   2. alter table public.mosque_staff validate constraint mosque_staff_email_format;
--   3. alter table public.mosque_staff_invites validate constraint
--        mosque_staff_invites_invitee_email_format;
