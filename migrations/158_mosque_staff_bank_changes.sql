-- 158_mosque_staff_bank_changes.sql
-- ====================================================================
-- >>> APPLIED + probed on dev + prod (prod probes match dev exactly). <<<
-- Commit C of the bank-details guarded flow, PART 1 (table only). The writer RPC
-- (update_staff_bank_details) + the dismiss RPC + the bank_details_changed email
-- intent + the approve_onboarding_session first-set row are item 2 / item 3 (next).
--
-- Anti-fraud + anti-mistake audit trail for changes to a staff member's bank
-- details (mosque_staff_employment.bank_*). The Gate 2 audit confirmed bank
-- CHANGES are the one unlogged write on the most sensitive staff data — reveal is
-- logged (onboarding_sensitive_viewed / mosque_staff_audit_log) and approval is
-- logged, but a bank-detail CHANGE was not.
--
-- MASKED-ONLY INVARIANT: this table stores ONLY masked values — account name →
-- first char + bullets ('A••••'); sort code → fully masked ('••-••-••'); account
-- number → bullets + last 4 ('••••1234'). NEVER plaintext. The full values live
-- solely in mosque_staff_employment (existing plaintext-at-rest, accepted; Supabase
-- Vault is a separate post-first-customer migration). Masking is done by the
-- inserting SECURITY DEFINER RPC, so this table creates NO new plaintext copy.
--
-- WRITE POSTURE: NO client INSERT/UPDATE/DELETE policy. Rows are written ONLY by
-- update_staff_bank_details (SECURITY DEFINER — runs as postgres, bypasses RLS);
-- the dashboard-insight dismiss is likewise a SECURITY DEFINER RPC. Owner (of the
-- mosque) + platform admin READ.
--
-- SAFETY: one new table + two indexes + one SELECT policy + anon revoke. No change
-- to any existing table; no data rewrite.
-- ====================================================================

begin;

create table if not exists public.mosque_staff_bank_changes (
  id                  uuid primary key default gen_random_uuid(),
  mosque_id           uuid not null references public.mosques(id)     on delete cascade,
  staff_id            uuid          references public.mosque_staff(id) on delete set null,
  actor_id            uuid          references public.profiles(id),   -- owner/admin who changed it
  changed_at          timestamptz not null default now(),

  -- MASKED only (never plaintext). old_* NULL on a first-ever set (no prior value).
  old_account_name    text,   -- 'A••••'
  old_sort_code       text,   -- '••-••-••'
  old_account_number  text,   -- '••••1234'  (last 4 only)
  new_account_name    text,
  new_sort_code       text,
  new_account_number  text,   -- '••••5678'  (last 4 only)

  notified            boolean not null default false,  -- anti-fraud email sent to staff?

  -- Dashboard-insight dismissal (item 3)
  dismissed           boolean not null default false,
  dismissed_at        timestamptz,
  dismissed_by        uuid          references public.profiles(id),

  created_at          timestamptz not null default now()
);

create index if not exists mosque_staff_bank_changes_mosque_idx on public.mosque_staff_bank_changes(mosque_id);
create index if not exists mosque_staff_bank_changes_staff_idx  on public.mosque_staff_bank_changes(staff_id);

alter table public.mosque_staff_bank_changes enable row level security;
revoke all on public.mosque_staff_bank_changes from anon;

-- Owner (of the mosque) + platform admin READ only. No write policy by design —
-- inserts + dismiss go through SECURITY DEFINER RPCs (items 2 + 3), which bypass RLS.
drop policy if exists "Owner+admin read bank changes" on public.mosque_staff_bank_changes;
create policy "Owner+admin read bank changes"
  on public.mosque_staff_bank_changes for select
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
    or public.is_admin()
  );

comment on table public.mosque_staff_bank_changes is
  'Audit trail of staff bank-detail changes (mosque_staff_employment.bank_*). '
  'MASKED values only — never plaintext. Written solely by update_staff_bank_details '
  '(SECURITY DEFINER); dismissed via a SECURITY DEFINER RPC. Powers the anti-fraud '
  'staff email + the anti-mistake dashboard insight.';

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-158-dev.mjs, then STOP):
--   P1  information_schema.columns — all 16 columns, types, nullability
--   P2  pg_policies — exactly one SELECT policy, no insert/update/delete
--   P3  has_table_privilege('anon', 'public.mosque_staff_bank_changes', 'INSERT') = false
--   P4  behavioural (rolled-back fixture, dev-ref guarded): service_role INSERT
--       lands; owner reads own-mosque rows; cross-mosque owner reads 0; anon blocked
--   Then STOP for prod go-ahead (before item 2: update_staff_bank_details RPC +
--   bank_details_changed email intent + the approve_onboarding_session first-set row).
-- ====================================================================
