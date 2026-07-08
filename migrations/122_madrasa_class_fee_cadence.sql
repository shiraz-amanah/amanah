-- 122_madrasa_class_fee_cadence.sql
-- ====================================================================
-- Recurring tuition subscription CONFIG on the class (Session BP).
-- A parent subscribes to a child's CLASS; the cadence + price live here.
--
-- MODEL BOUNDARY (read this before touching fees):
--   * madrasa_classes.fee_cadence (THIS migration) + madrasa_subscriptions (123)
--       = RECURRING subscriptions (Stripe, 2.5% application_fee_percent per cycle).
--   * madrasa_fees / madrasa_fee_records (migration 111)
--       = ONE-OFF / ad-hoc ledger (trips, uniform, arrears; BO one-off Checkout).
--   Deliberately SEPARATE sources of truth. Do NOT conflate them.
--   (Note the pounds-vs-pence split: 111 stores numeric(10,2) pounds; all
--    subscription money — here + 123 — is INTEGER PENCE, matching Stripe.)
-- ====================================================================

alter table public.madrasa_classes
  add column if not exists fee_cadence text not null default 'none'
    check (fee_cadence in ('none','free_trial','monthly','termly')),
  add column if not exists fee_amount_pence integer,
  add column if not exists trial_duration_days integer not null default 14
    check (trial_duration_days between 1 and 90),
  add column if not exists term_dates jsonb not null default '[]'::jsonb,   -- [{name, start_date}] for termly
  add column if not exists subscription_pause_enabled boolean not null default true;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev — ref pbejyukihhmybxxtheqq — first, then prod).
--   Probe (RAW rows, never trust the Success banner):
--     select column_name, data_type, is_nullable, column_default
--       from information_schema.columns
--       where table_name='madrasa_classes'
--         and column_name in ('fee_cadence','fee_amount_pence','trial_duration_days',
--                             'term_dates','subscription_pause_enabled')
--       order by column_name;                               -- expect 5 rows
-- ====================================================================
