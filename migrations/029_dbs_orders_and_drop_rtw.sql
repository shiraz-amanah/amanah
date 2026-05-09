-- migrations/029_dbs_orders_and_drop_rtw.sql
-- STATUS: Verbatim (Session L)
-- Bundles two concerns:
--   Part A: drop scholars.rtw_verified (scholars are contractors, not employees)
--   Part B: create dbs_orders table + RLS

-- ============================================================================
-- Part A: Drop scholars.rtw_verified
-- ============================================================================
-- Scholars are independent contractors on Amanah, not employees of the
-- platform. RTW (Right to Work) applies to employees. K-2 verification
-- UI changes from three toggles to two (DBS + Ijazah). Mosque staff DO
-- need RTW — that flag lives on mosque_staff (Session M), not here.

alter table public.scholars drop column if exists rtw_verified;

-- ============================================================================
-- Part B: dbs_orders table
-- ============================================================================

create table public.dbs_orders (
  id uuid primary key default gen_random_uuid(),

  -- Subject (candidate is the person the DBS check is FOR)
  candidate_user_id uuid not null references public.profiles(id) on delete cascade,
  scholar_id uuid references public.scholars(id) on delete set null,
  mosque_id uuid references public.mosques(id) on delete set null,

  -- Order details
  level text not null check (level in ('basic', 'enhanced')),
  stage text not null default 'requested' check (stage in (
    'requested',
    'paid',
    'submitted',
    'in_progress',
    'issued',
    'issued_with_disclosure',
    'cancelled'
  )),

  -- Payment (mock for L; real Stripe in Q)
  payment_status text not null default 'unpaid' check (payment_status in (
    'unpaid', 'paid', 'refunded'
  )),
  amount_pence integer not null check (amount_pence > 0),
  payment_reference text,

  -- Lifecycle metadata
  -- ordered_by is NULLABLE per L Critical-2 review: NOT NULL + ON DELETE
  -- SET NULL is contradictory. Audit-field semantics OK with null after
  -- profile deletion (orphaned but preserved). Helper always sets it at
  -- INSERT; INSERT policy enforces ordered_by = auth.uid() so live writes
  -- can't slip through with null.
  ordered_by uuid references public.profiles(id) on delete set null,
  notes text,
  certificate_url text,
  disclosure_summary text,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  submitted_at timestamptz,
  issued_at timestamptz,
  cancelled_at timestamptz
);

-- Index for candidate queries (their own orders)
create index dbs_orders_candidate_idx
  on public.dbs_orders(candidate_user_id, created_at desc);

-- Index for admin queue stage filtering
create index dbs_orders_stage_idx
  on public.dbs_orders(stage, created_at desc);

-- Partial indexes on org context (most rows won't have these set)
create index dbs_orders_scholar_idx
  on public.dbs_orders(scholar_id) where scholar_id is not null;
create index dbs_orders_mosque_idx
  on public.dbs_orders(mosque_id) where mosque_id is not null;

-- Partial unique index — enforces "one active order per candidate"
create unique index dbs_orders_one_active_per_candidate_idx
  on public.dbs_orders(candidate_user_id)
  where stage in ('requested', 'paid', 'submitted', 'in_progress');

-- Updated_at trigger (mirrors pattern from other K-tables)
create or replace function public.touch_dbs_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger dbs_orders_touch_updated_at
  before update on public.dbs_orders
  for each row execute function public.touch_dbs_orders_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.dbs_orders enable row level security;

-- Candidate reads own orders
create policy "Candidates read own DBS orders"
  on public.dbs_orders for select to authenticated
  using (candidate_user_id = auth.uid());

-- Candidate inserts own orders. Self-serve flow is "insert with paid"
-- (single round-trip — see L Critical-1 amendment). Policy doesn't constrain
-- stage / payment_status; the helper picks those. Future Session-M mosque-
-- orders-for-staff will need a separate policy with ordered_by != candidate_user_id.
create policy "Candidates create own DBS orders"
  on public.dbs_orders for insert to authenticated
  with check (
    candidate_user_id = auth.uid()
    and ordered_by = auth.uid()
  );

-- Candidate updates own order — only for cancel, only when stage in
-- (requested, paid). WITH CHECK enforces the new state must be cancelled,
-- so candidate can't escalate stage or flip payment_status to anything
-- else via this policy. Helper-level enforcement (cancelMyDBSOrder) layers
-- on top; this is the security backstop.
create policy "Candidates cancel own DBS orders"
  on public.dbs_orders for update to authenticated
  using (
    candidate_user_id = auth.uid()
    and stage in ('requested', 'paid')
  )
  with check (
    candidate_user_id = auth.uid()
    and stage = 'cancelled'
  );

-- Admin reads all
create policy "Admins read all DBS orders"
  on public.dbs_orders for select to authenticated
  using (public.is_admin());

-- Admin updates all
create policy "Admins update all DBS orders"
  on public.dbs_orders for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- Apply checklist (run separately in Supabase SQL editor after the above):
--   notify pgrst, 'reload schema';
-- Then probe (per K-7 lesson — never trust "Success. No rows returned" alone):
--   1. select column_name from information_schema.columns
--        where table_name='scholars' and column_name='rtw_verified';
--      Expected: 0 rows.
--   2. select column_name, is_nullable from information_schema.columns
--        where table_schema='public' and table_name='dbs_orders'
--        order by ordinal_position;
--      Expected: 19 rows; ordered_by is_nullable='YES'.
--   3. select policyname, cmd from pg_policies where tablename='dbs_orders';
--      Expected: 5 rows (2 candidate-side + admin SELECT + admin UPDATE
--      + candidate cancel UPDATE).
--   4. select indexname from pg_indexes where tablename='dbs_orders';
--      Expected: 6 indexes incl. dbs_orders_one_active_per_candidate_idx.
--   5. select conname from pg_constraint
--        where conrelid = 'public.dbs_orders'::regclass;
--      Verify dbs_orders_candidate_user_id_fkey is present (commit 4 alias).
-- Then hard-refresh the app.
-- ============================================================================
