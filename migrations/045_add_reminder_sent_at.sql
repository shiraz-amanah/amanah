-- Migration 045: add `reminder_sent_at` to bookings (Session Q — transactional emails)
--
-- NOT yet applied — surfaced for approval. Apply in the SQL editor (dev then
-- prod), then run `NOTIFY pgrst, 'reload schema';` and hard-refresh so PostgREST
-- picks up the new column.
--
-- Why this column exists:
--   The 24-hour booking reminder is sent by an hourly sweep (Vercel Cron →
--   api/send-transactional in reminder mode; see vercel.json + migration 046's
--   get_due_reminders()). The sweep selects every confirmed booking whose
--   scheduled_at falls in the next-day window. Because it runs EVERY hour, the
--   same booking matches that window ~24 times — without a guard each booking
--   would be reminded ~24× to BOTH parties. `reminder_sent_at` is that guard:
--   the sweep filters `reminder_sent_at IS NULL` and stamps it `now()` once the
--   pair of reminder emails has been sent, so each booking is reminded exactly
--   once. (This is the load-bearing idempotency key for the cron — see the
--   "THINGS TO WATCH" note in the Session Q brief.)
--
-- Note the booking time column is `scheduled_at` (timestamptz, UTC), NOT
-- `start_time` — see createBooking in src/auth.js and migration
-- 008_bookings_table_TODO.sql.
--
-- The write is performed server-side by the sweep using the service-role key
-- (api/send-transactional), which bypasses RLS — so no new bookings RLS policy
-- is needed for this column. Nullable with no default: existing rows stay NULL
-- (un-reminded) and only become non-NULL after a reminder actually fires.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Partial index to keep the hourly sweep cheap: it only ever scans
-- not-yet-reminded confirmed bookings, which is a small slice of the table.
CREATE INDEX IF NOT EXISTS bookings_reminder_due_idx
  ON public.bookings (scheduled_at)
  WHERE reminder_sent_at IS NULL AND status = 'confirmed';

-- After applying:
--   NOTIFY pgrst, 'reload schema';
