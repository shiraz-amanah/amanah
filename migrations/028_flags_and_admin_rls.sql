-- STATUS: Verbatim
-- Already applied: TBD (Session K-7, 8 May 2026)
--
-- Phase 7 schema. Bundles four concerns:
--   (A,B) restore admin RLS on scholars + reviews — 020/021 were authored
--         and committed but pg_policies probe at K-7 pre-flight confirmed
--         neither was applied to prod.
--   (C)   admin UPDATE on messages (new for Phase 7's softDeleteMessage).
--   (D)   flags table + RLS + indexes (Phase 7 core).

-- =============================================================================
-- Part A — restore K-2 admin RLS on scholars (originally migration 020).
-- DROP POLICY IF EXISTS guards against partial-prior-apply drift.
-- =============================================================================

drop policy if exists "Admins read all scholars" on scholars;
create policy "Admins read all scholars"
  on scholars for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins update all scholars" on scholars;
create policy "Admins update all scholars"
  on scholars for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- Part B — restore K-3 admin RLS on reviews (originally migration 021).
-- =============================================================================

drop policy if exists "Admins read all reviews" on reviews;
create policy "Admins read all reviews"
  on reviews for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins update review status" on reviews;
create policy "Admins update review status"
  on reviews for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- Part C — admin UPDATE on messages (new for Phase 7).
-- Required for softDeleteMessage to flip messages.deleted_at on flagged
-- content. Existing Session-D policies on messages stay unchanged (additive).
-- =============================================================================

create policy "Admins update messages"
  on messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- Part D — flags table + indexes + RLS (Phase 7 core).
-- Polymorphic via subject_type ∈ {scholar,mosque,review,message}. Audit trail
-- preserved: users can INSERT and SELECT-own only; admins-only UPDATE.
-- resolution_action is enum-locked via CHECK; expanding it later requires
-- ALTER + PostgREST schema reload.
-- =============================================================================

create table flags (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  subject_type text not null check (subject_type in ('scholar','mosque','review','message')),
  subject_id uuid not null,
  reason text not null check (reason in ('spam','harassment','inappropriate','misinformation','safeguarding','other')),
  details text check (details is null or length(details) <= 1000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution_action text check (resolution_action is null or resolution_action in ('none','hide_review','unpublish_scholar','unpublish_mosque','soft_delete_message')),
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- details required when reason='other' so admin triage has substance
  constraint flags_other_requires_details
    check (reason <> 'other' or (details is not null and length(details) >= 1))
);

create index flags_subject_idx on flags (subject_type, subject_id);
create index flags_open_idx on flags (status) where status = 'open';
create index flags_created_at_idx on flags (created_at desc);

-- Dedup: one open flag per (reporter, subject). Resolved/dismissed flags
-- don't count, so a user can re-flag after admin action if abuse continues.
create unique index flags_one_open_per_reporter_per_subject
  on flags (reporter_id, subject_type, subject_id)
  where status = 'open';

alter table flags enable row level security;

create policy "Users insert own flags"
  on flags for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy "Users read own flags"
  on flags for select
  to authenticated
  using (reporter_id = auth.uid());

create policy "Admins read all flags"
  on flags for select
  to authenticated
  using (public.is_admin());

create policy "Admins update flags"
  on flags for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No user UPDATE / DELETE policies. Flags are immutable once submitted —
-- admins flip status / resolution_action / resolved_by / resolved_at via
-- the UPDATE policy above; everything else is INSERT-once + SELECT-own.

-- =============================================================================
-- Apply checklist (run separately in Supabase SQL editor after the above):
--   notify pgrst, 'reload schema';
-- Then hard-refresh the browser. Both required, neither sufficient alone.
-- =============================================================================
