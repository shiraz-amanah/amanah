-- 123_madrasa_subscriptions.sql
-- ====================================================================
-- Recurring tuition subscriptions (Session BP). A parent subscribes to a child's
-- CLASS; billing runs on the mosque's CONNECTED Stripe account with a 2.5%
-- application_fee_percent (Amanah's cut) on every cycle. Stripe is the source of
-- truth; this table is kept in sync by customer.subscription.* / invoice.* webhooks
-- in api/stripe-connect.js.
--
-- MODEL BOUNDARY (see 122): THIS + madrasa_classes.fee_cadence = RECURRING;
-- madrasa_fees / madrasa_fee_records (111) = ONE-OFF ledger. Do not conflate.
--
-- MONEY: PENCE (integer), matching mosque_payments/Stripe (no float money).
-- FKs: mosque_id NOT NULL + cascade (mosque gone => its data gone); student_id/
-- class_id/parent_id nullable + ON DELETE SET NULL so the subscription row (an
-- MRR/audit record) survives if a student/class/parent is later removed — same
-- history-preserving precedent as mosque_payments.student_id (120). (NOT NULL +
-- SET NULL would be contradictory — see Session L.)
-- WRITES: service-role only (webhook + stripe-connect.js action handlers). No client write.
-- ====================================================================

create table if not exists public.madrasa_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  mosque_id               uuid not null references public.mosques(id)         on delete cascade,
  student_id              uuid          references public.students(id)        on delete set null,
  class_id                uuid          references public.madrasa_classes(id) on delete set null,
  parent_id               uuid          references public.profiles(id)        on delete set null,
  stripe_subscription_id  text unique,          -- set by customer.subscription.created
  stripe_customer_id      text,
  cadence                 text not null check (cadence in ('free_trial','monthly','termly')),
  status                  text not null default 'trialing'
                            check (status in ('trialing','active','past_due','canceled','paused')),
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  trial_end               timestamptz,
  cancel_at_period_end    boolean not null default false,
  canceled_at             timestamptz,
  amount_pence            integer check (amount_pence >= 0),
  fee_percent             numeric not null default 2.5,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists madrasa_subscriptions_mosque_idx   on public.madrasa_subscriptions(mosque_id);
create index if not exists madrasa_subscriptions_student_idx  on public.madrasa_subscriptions(student_id);
create index if not exists madrasa_subscriptions_class_idx    on public.madrasa_subscriptions(class_id);
create index if not exists madrasa_subscriptions_parent_idx   on public.madrasa_subscriptions(parent_id);
create index if not exists madrasa_subscriptions_status_idx   on public.madrasa_subscriptions(status);

alter table public.madrasa_subscriptions enable row level security;
revoke all on public.madrasa_subscriptions from anon;

-- Mosque owner reads their mosque's subscriptions.
create policy "Mosque owner reads own subscriptions"
  on public.madrasa_subscriptions for select to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Parent reads their own subscriptions.
create policy "Parent reads own subscriptions"
  on public.madrasa_subscriptions for select to authenticated
  using (parent_id = auth.uid());

-- Admin reads all.
create policy "Admins read all subscriptions"
  on public.madrasa_subscriptions for select to authenticated
  using (public.is_admin());
-- (No INSERT/UPDATE/DELETE policies — service-role only.)

create or replace function public.touch_madrasa_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger madrasa_subscriptions_touch_updated_at
  before update on public.madrasa_subscriptions
  for each row execute function public.touch_madrasa_subscriptions_updated_at();

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev — ref pbejyukihhmybxxtheqq — first, then prod).
--   Probe (RAW rows, never trust the Success banner):
--     select column_name, data_type, is_nullable, column_default
--       from information_schema.columns
--       where table_name='madrasa_subscriptions' order by ordinal_position;    -- 19 rows
--     select relrowsecurity from pg_class where relname='madrasa_subscriptions';  -- t
--     select policyname, cmd, roles from pg_policies where tablename='madrasa_subscriptions'; -- 3, all SELECT
--     select grantee, privilege_type from information_schema.role_table_grants
--       where table_name='madrasa_subscriptions' and grantee='anon';            -- 0 rows
-- ====================================================================
