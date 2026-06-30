-- 100_mosque_events_recurrence.sql — recurring events (weekly/monthly)
--
-- Approach (b): each occurrence is its own concrete dated row, so all existing
-- date>=today reads, ordering and limits keep working unchanged (homepage
-- getUpcomingEvents, public-profile getMosqueUpcomingEvents, owner getMosqueEvents).
-- Sibling occurrences are linked by recurrence_group_id; recurrence records the
-- cadence so the owner UI can collapse a series to its next occurrence, badge it,
-- top it up on load, and edit/delete "this occurrence vs all future". One-off
-- events keep recurrence='none' and a null recurrence_group_id.
--
-- Horizon (owner-side, not enforced here): weekly maintains ~26 occurrences,
-- monthly ~12. Rolled forward by a top-up on owner load (a scheduled cron is the
-- planned long-term replacement — see NOTES follow-up).
--
-- RLS is unchanged: the existing per-row owner_all + public_read policies from
-- 051 already cover these columns (no column-level policies exist).

alter table public.mosque_events
  add column if not exists recurrence text not null default 'none'
    check (recurrence in ('none','weekly','monthly')),
  add column if not exists recurrence_group_id uuid;

create index if not exists mosque_events_recurrence_group_idx
  on public.mosque_events(recurrence_group_id);

notify pgrst, 'reload schema';

-- APPLY CHECKLIST:
--   1. run the SQL
--   2. NOTIFY pgrst is included above
--   3. probe: both columns exist
--        select column_name, data_type, column_default
--          from information_schema.columns
--         where table_name = 'mosque_events'
--           and column_name in ('recurrence','recurrence_group_id');
--      probe: the index exists
--        select indexname from pg_indexes
--         where tablename = 'mosque_events'
--           and indexname = 'mosque_events_recurrence_group_idx';
--      probe: the check constraint accepts only none/weekly/monthly
--   4. hard-refresh the browser
