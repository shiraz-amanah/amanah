-- 124_madrasa_subscription_events.sql
-- ====================================================================
-- Append-only audit log for subscription lifecycle + dunning (Session BP).
-- One row per meaningful Stripe event we act on. Drives the dunning cadence
-- (day 0 / 3 / 7) and gives mosque admin + parent a visible history.
-- WRITES: service-role only (webhook). No client write. No updated_at (immutable).
-- ====================================================================

create table if not exists public.madrasa_subscription_events (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references public.madrasa_subscriptions(id) on delete cascade,
  event_type       text not null
                     check (event_type in (
                       'payment_failed','dunning_1','dunning_2','dunning_3',
                       'canceled','paused','resumed','trial_ending_soon','payment_succeeded')),
  stripe_event_id  text unique,   -- Stripe event id; unique => webhook-retry dedup (nulls allowed)
  created_at       timestamptz not null default now()
);

create index if not exists madrasa_subscription_events_sub_idx
  on public.madrasa_subscription_events(subscription_id);

alter table public.madrasa_subscription_events enable row level security;
revoke all on public.madrasa_subscription_events from anon;

-- Mosque owner reads events for their mosque's subscriptions.
create policy "Mosque owner reads own subscription events"
  on public.madrasa_subscription_events for select to authenticated
  using (subscription_id in (
    select id from public.madrasa_subscriptions
      where mosque_id in (select id from public.mosques where user_id = auth.uid())));

-- Parent reads events for their own subscriptions.
create policy "Parent reads own subscription events"
  on public.madrasa_subscription_events for select to authenticated
  using (subscription_id in (
    select id from public.madrasa_subscriptions where parent_id = auth.uid()));

-- Admin reads all.
create policy "Admins read all subscription events"
  on public.madrasa_subscription_events for select to authenticated
  using (public.is_admin());
-- (No write policies — service-role only.)

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod). Probe (RAW rows):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--     where table_name='madrasa_subscription_events' order by ordinal_position;   -- 5 rows
--   select relrowsecurity from pg_class where relname='madrasa_subscription_events'; -- t
--   select policyname, cmd, roles from pg_policies where tablename='madrasa_subscription_events'; -- 3 SELECT
--   select grantee, privilege_type from information_schema.role_table_grants
--     where table_name='madrasa_subscription_events' and grantee='anon';           -- 0 rows
-- ====================================================================
