-- 174_staff_email_unique_real_emails_only.sql
-- ====================================================================
-- Narrows mosque_staff_mosque_email_unique (migration 146) from
-- NULLS NOT DISTINCT to a PARTIAL index over real emails only.
--
-- WHAT 146 DID AND WHY IT WAS OVER-BROAD:
-- 146 created
--   create unique index mosque_staff_mosque_email_unique
--     on public.mosque_staff (mosque_id, lower(email)) nulls not distinct;
-- and stated the NULL half deliberately: "at most one NULL-email staff
-- row per mosque". But the uniqueness that actually matters is among
-- REAL emails. That is what keeps migration 055's invite-link
-- unambiguous: accept_staff_invite resolves a pre-existing directory row
-- by `lower(mosque_staff.email) = lower(inv.invitee_email)` and INSERTs a
-- duplicate on a miss, so two rows sharing one real email at one mosque
-- would make that link ambiguous. That guarantee is PRESERVED here,
-- unchanged.
--
-- NULL rows can never participate in that join at all: lower(NULL) is
-- NULL and `NULL = anything` is NULL, never true, so a NULL-email row is
-- structurally unmatchable by 055. Uniqueness among NULLs therefore
-- protected nothing — while actively blocking two legitimate states:
--
--   1. REPEAT ERASURES. Migration 172 made anonymise_staff write
--      `email = null` (chosen precisely because NULL cannot false-link
--      under 055, and passes 134's mosque_staff_email_format CHECK).
--      Under NULLS NOT DISTINCT only the FIRST staff member at a mosque
--      could be erased; the second raised 23505 on this index. At a
--      mosque already holding one NULL-email row, even the first erasure
--      failed. GDPR right-to-erasure cannot be a once-per-mosque action.
--      This was caught by usage verification, not by shape inspection —
--      146 expressed the guard as a unique INDEX (it had to, for the
--      lower() expression), so it does not appear in pg_constraint.
--
--   2. MULTIPLE EMAIL-LESS IN-HOUSE STAFF. 134's header records email as
--      nullable on purpose — "in-house staff may have none". Rows with a
--      NULL email are genuinely produced: the legacy accept_staff_invite
--      inserts at 030:366 and 033:122 omit the email column entirely.
--      (Note the current AddStaffModal requires a valid email, so this
--      state is not reachable from that form today — it arrives via the
--      legacy/server paths and direct writes.)
--
-- WHAT CHANGES: nothing for real emails. Two rows with the same
-- lower(email) at one mosque still collide with 23505, so
-- AddStaffModal's staffCreateError translation ("A staff member with
-- this email already exists") keeps working untouched. Only the
-- NULL-vs-NULL collision goes away.
--
-- Pre-write sweep for code depending on 146's NULL semantics: no
-- `.is('email', null)` on mosque_staff anywhere in src/ or api/, no
-- `email IS NULL` predicate against mosque_staff in any migration, no
-- upsert or ON CONFLICT using this index as its arbiter (133's
-- `on conflict (staff_id)` is on mosque_staff_employment, a different
-- table). Nothing relies on there being at most one blank-email row.
--
-- Cross-refs: 055 (the lower(email) link invariant this preserves),
-- 134 (the CHECK that admits NULL), 146 (the index being narrowed),
-- 172 (the erasure that writes NULL and collided here).
--
-- DROP + CREATE rather than a rename dance: the index is small and this
-- is not a hot path. Not CONCURRENTLY — the table is tiny (146 made the
-- same call for the same reason).
-- ====================================================================

begin;

drop index if exists public.mosque_staff_mosque_email_unique;

create unique index mosque_staff_mosque_email_unique
  on public.mosque_staff (mosque_id, lower(email))
  where email is not null;

commit;

notify pgrst, 'reload schema';

-- Probe after applying (dev then prod) — expect the partial predicate and
-- NO "NULLS NOT DISTINCT":
--   select indexdef from pg_indexes
--    where tablename = 'mosque_staff'
--      and indexname = 'mosque_staff_mosque_email_unique';
--   -- expect: ... USING btree (mosque_id, lower(email)) WHERE (email IS NOT NULL)
--
-- Usage verification (NOT shape) — all three must hold:
--   1. Erase TWO staff at the same mosque: both succeed (this is the
--      case that raised 23505 before 174).
--   2. Erase a staff member at a mosque that ALREADY holds a NULL-email
--      row: succeeds.
--   3. Two rows with the SAME real email at one mosque still raise 23505
--      — the invariant 146 was actually protecting must survive.
