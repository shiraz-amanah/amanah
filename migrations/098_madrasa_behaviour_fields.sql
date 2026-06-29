-- 098_madrasa_behaviour_fields.sql
-- ====================================================================
-- Behaviour / Conduct tab (Session AV item 1). madrasa_rewards (083) already
-- models per-student behaviour — type in (star, merit, achievement, warning,
-- concern) + note + awarded_by + full RLS (owner / class-teacher / parent-read).
-- This migration ENRICHES that table for proper incident logging rather than
-- adding a second behaviour table (keeps one home for all behaviour, reuses the
-- existing policies).
--
-- Five additive columns:
--   severity          — low/medium/high (incidents; null for positive notes)
--   category          — what kind of incident (null for positive notes)
--   action_taken      — free text: what the teacher/admin did / follow-up note
--   status            — open/resolved; NOT NULL default 'resolved' so existing
--                       rows + positive notes are 'resolved'; incidents needing
--                       follow-up are 'open'.
--   visible_to_parent — NOT NULL default true; lets a teacher keep a concern
--                       INTERNAL before escalating. Existing rows backfill true
--                       (no change to what parents currently see).
--
-- RLS — ONE REQUIRED CHANGE: the 083 parent-read policy exposes ALL of a child's
-- rows. visible_to_parent is meaningless unless that policy honours it, so we
-- DROP + recreate it with `and visible_to_parent`. Without this the column would
-- be cosmetic and parents would still read internal concerns (a silent privacy
-- failure). Owner + class-teacher policies are UNCHANGED — staff always see
-- everything, internal or not. No new functions/grants.
--
-- Email path NOT touched here: reward emails are fired by the app AFTER insert
-- (not a DB trigger), so the build gates sending on visible_to_parent app-side.
-- The RLS read-guard above is the actual protection (parents can't READ an
-- internal row regardless of email).
--
-- Depends on: 083 (madrasa_rewards + the parent-read policy).
-- Apply dev first, probe, then prod, probe. NOT auto-applied.
-- ====================================================================

alter table public.madrasa_rewards
  add column if not exists severity          text
    check (severity in ('low', 'medium', 'high')),
  add column if not exists category          text
    check (category in ('disruption', 'homework', 'respect', 'uniform', 'punctuality', 'other')),
  add column if not exists action_taken      text,
  add column if not exists status            text not null default 'resolved'
    check (status in ('open', 'resolved')),
  add column if not exists visible_to_parent boolean not null default true;

-- Fast path for the "open incidents needing follow-up" view (per mosque).
create index if not exists madrasa_rewards_open_idx
  on public.madrasa_rewards(mosque_id, awarded_at desc)
  where status = 'open';

-- REQUIRED: parent-read must respect visible_to_parent (else internal concerns
-- leak). Recreated verbatim from 083 + the one new condition. Staff policies
-- (owner / class-teacher) are intentionally left as-is.
drop policy if exists "Parent read own-child rewards" on public.madrasa_rewards;
create policy "Parent read own-child rewards"
  on public.madrasa_rewards for select to authenticated
  using (
    student_id in (select id from public.students where profile_id = auth.uid())
    and visible_to_parent
  );

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, probe, then prod, probe):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        select column_name, data_type, is_nullable, column_default
--          from information_schema.columns
--          where table_name = 'madrasa_rewards'
--            and column_name in ('severity','category','action_taken','status','visible_to_parent')
--          order by column_name;                                        -- 5 rows
--        select indexname from pg_indexes where indexname = 'madrasa_rewards_open_idx';  -- 1 row
--        -- existing rows backfilled (status resolved, visible true):
--        select status, visible_to_parent, count(*) from public.madrasa_rewards
--          group by status, visible_to_parent;                          -- all resolved / true
--        -- parent policy now references visible_to_parent:
--        select polname, qual from pg_policies
--          where tablename = 'madrasa_rewards' and polname = 'Parent read own-child rewards';
--          -- qual must include: visible_to_parent
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
