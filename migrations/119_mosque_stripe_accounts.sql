-- 119_mosque_stripe_accounts.sql
-- ====================================================================
-- Stripe Connect (Express) account linkage for mosques — the foundation for
-- taking payments (Session BN). Payment COLLECTION + the 2.5% platform fee are
-- Session 2; this table only records the connected account + its onboarding state.
--
-- WHY A SEPARATE TABLE (not columns on `mosques`): `mosques` has a PUBLIC select
-- policy (024 — "Active mosques are publicly viewable" to anon+authenticated), and
-- Postgres RLS is row-level, so ANY column added to `mosques` would be world-
-- readable for active mosques. A column-level REVOKE would instead break the
-- existing `select('*')` public reads. A dedicated owner-only table is the only
-- way to get true "owner reads their own, no one else," and it matches the
-- existing mosque_claims / mosque_applications pattern.
--
-- WRITES: performed exclusively by api/stripe-connect.js with the SERVICE ROLE
-- (bypasses RLS) — after that function has verified the caller owns the mosque
-- (create-account / onboarding-complete) or verified the Stripe webhook signature
-- (account.updated). Hence there is NO INSERT/UPDATE/DELETE policy here: no client
-- can write this table directly.
-- ====================================================================

create table if not exists public.mosque_stripe_accounts (
  mosque_id            uuid primary key references public.mosques(id) on delete cascade,
  stripe_account_id    text unique,          -- Stripe Connect acct_… (unique index doubles as the webhook lookup)
  onboarding_complete  boolean not null default false,
  charges_enabled      boolean not null default false,
  payouts_enabled      boolean not null default false,
  details_submitted    boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.mosque_stripe_accounts enable row level security;

-- anon must never touch this table. Explicit revoke (mirrors 031 for mosque_staff)
-- so a default public/anon grant can't leave a gap; RLS + this belt-and-braces.
revoke all on public.mosque_stripe_accounts from anon;

-- Owner reads their own Stripe status (drives the Payments tab). No public policy.
create policy "Mosque owner reads own stripe account"
  on public.mosque_stripe_accounts for select
  to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Admin reads all (support / oversight).
create policy "Admins read all stripe accounts"
  on public.mosque_stripe_accounts for select
  to authenticated
  using (public.is_admin());

-- (No INSERT/UPDATE/DELETE policies by design — only the service-role function writes.)

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- columns (expect 8 rows)
--        select column_name, data_type, is_nullable, column_default
--          from information_schema.columns
--          where table_name = 'mosque_stripe_accounts' order by ordinal_position;
--        -- RLS on (relrowsecurity = t)
--        select relrowsecurity from pg_class where relname = 'mosque_stripe_accounts';
--        -- policies: exactly 2, both SELECT, no write policies
--        select policyname, cmd, roles from pg_policies where tablename = 'mosque_stripe_accounts';
--        -- anon has NO privileges on the table (expect 0 rows)
--        select grantee, privilege_type from information_schema.role_table_grants
--          where table_name = 'mosque_stripe_accounts' and grantee = 'anon';
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
