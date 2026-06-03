-- Migration 047: booking cancellation fields (Session R)
--
-- NOT yet applied — surfaced for approval. Apply in the SQL editor (dev then
-- prod), then `NOTIFY pgrst, 'reload schema';` + hard refresh.
--
-- NOTE: bookings.status is plain `text`, NOT a Postgres enum (no CREATE TYPE
-- exists for it — see migration 008). So there is nothing to ALTER and no enum
-- value to add: `status = 'cancelled'` already works and is already in use
-- (today's cancelBooking sets it). This migration only adds the metadata columns
-- the cancellation flow records.
--
-- cancelled_at ALREADY EXISTS (set by the current cancelBooking) — included with
-- IF NOT EXISTS so this is a safe no-op for that column.
--
-- cancelled_by stores a ROLE LABEL ('family' | 'scholar' | 'admin'), not a
-- user_id — it is what the cancellation email copy and refund logic key off, and
-- it is derived by the cancel_booking RPC (migration 048) from which party the
-- caller matches, NOT from profiles.role (there is no 'family' role; a family
-- user has role 'user'). If a user_id audit trail is wanted later, add a separate
-- cancelled_by_user_id column.
--
-- refund_policy is text + CHECK (the codebase convention, e.g. saves.item_type),
-- not a PG enum. Under the current policy logic ('none' is reserved for future
-- use — scholar/admin cancels are always 'full', family is 'full' or 'partial').

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS refund_policy       text;

-- Constrain the two new label columns. Done as separate, idempotent-ish ALTERs
-- guarded by a DO block so re-running doesn't error on an existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_cancelled_by_check') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_cancelled_by_check
      CHECK (cancelled_by IS NULL OR cancelled_by IN ('family','scholar','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_refund_policy_check') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_refund_policy_check
      CHECK (refund_policy IS NULL OR refund_policy IN ('full','partial','none'));
  END IF;
END $$;

-- After applying:
--   NOTIFY pgrst, 'reload schema';
--
-- 5-probe (adjusted — status is text, so there is no enum value to check;
-- instead confirm a row can carry status='cancelled'):
--   select column_name from information_schema.columns
--    where table_name='bookings'
--      and column_name in ('cancelled_at','cancelled_by','cancellation_reason','refund_policy');
--   -- expect 4 rows
--   select 'cancelled'::text;  -- status accepts 'cancelled' (text column, always true)
