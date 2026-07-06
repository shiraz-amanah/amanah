-- 120_mosque_payments.sql
-- ====================================================================
-- One-off parent payments via Stripe Checkout on the mosque's CONNECTED account
-- (Session BO). Money goes to the mosque; Amanah takes a 2.5% platform fee via
-- application_fee_amount. This table is the local record of each payment + its
-- lifecycle; the source of truth is Stripe, kept in sync by the
-- payment_intent.succeeded webhook in api/stripe-connect.js.
--
-- WRITES: service-role only (api/stripe-connect.js) — create-checkout inserts a
-- 'pending' row, the webhook flips it to 'succeeded' and (if linked) marks the
-- madrasa_fee_records row 'paid'. Hence NO client INSERT/UPDATE/DELETE policy.
--
-- READS (RLS): mosque owner reads their mosque's payments; a parent reads payments
-- for their OWN children (same student_id pattern as 070/068 — a null student_id
-- payment is mosque-level and not parent-visible); admin reads all.
--
-- Amounts are in PENCE (integer) to match Stripe (avoids float rounding on money).
-- ====================================================================

create table if not exists public.mosque_payments (
  id                          uuid primary key default gen_random_uuid(),
  mosque_id                   uuid not null references public.mosques(id)              on delete cascade,
  student_id                  uuid          references public.students(id)             on delete set null,  -- nullable: some payments aren't per-student
  fee_record_id               uuid          references public.madrasa_fee_records(id)  on delete set null,  -- nullable: links a madrasah fee record
  stripe_payment_intent_id    text unique,          -- filled by the webhook (payment_intent.succeeded)
  stripe_checkout_session_id  text unique,          -- set at create-checkout
  amount_pence                integer not null check (amount_pence > 0),
  fee_pence                   integer not null default 0 check (fee_pence >= 0),       -- Amanah's 2.5% cut
  currency                    text    not null default 'gbp',
  status                      text    not null default 'pending'
                                check (status in ('pending','succeeded','failed','refunded')),
  description                 text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists mosque_payments_mosque_idx     on public.mosque_payments(mosque_id);
create index if not exists mosque_payments_student_idx    on public.mosque_payments(student_id);
create index if not exists mosque_payments_fee_record_idx on public.mosque_payments(fee_record_id);

alter table public.mosque_payments enable row level security;

-- anon never touches this table (mirrors 119 / 031).
revoke all on public.mosque_payments from anon;

-- Mosque owner reads their mosque's payments.
create policy "Mosque owner reads own payments"
  on public.mosque_payments for select to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Parent reads payments for their own children (same pattern as 070/068).
create policy "Parent reads own children payments"
  on public.mosque_payments for select to authenticated
  using (student_id in (select id from public.students where profile_id = auth.uid()));

-- Admin reads all.
create policy "Admins read all payments"
  on public.mosque_payments for select to authenticated
  using (public.is_admin());

-- (No INSERT/UPDATE/DELETE policies by design — only the service-role function writes.)

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- columns (expect 13 rows)
--        select column_name, data_type, is_nullable, column_default
--          from information_schema.columns
--          where table_name = 'mosque_payments' order by ordinal_position;
--        -- RLS on (relrowsecurity = t)
--        select relrowsecurity from pg_class where relname = 'mosque_payments';
--        -- policies: exactly 3, all SELECT, no write policies
--        select policyname, cmd, roles from pg_policies where tablename = 'mosque_payments';
--        -- anon has NO privileges (expect 0 rows)
--        select grantee, privilege_type from information_schema.role_table_grants
--          where table_name = 'mosque_payments' and grantee = 'anon';
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
