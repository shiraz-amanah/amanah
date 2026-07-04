-- 115_madrasa_delivery_mode.sql
-- ====================================================================
-- Class delivery mode + per-student remote flag (Live Lesson Improvement 2).
--   * madrasa_classes.delivery_mode — in_person | remote | hybrid
--   * madrasa_enrollments.attends_remotely — which students join via video
-- Both live on owner-managed tables (068 owner-manage RLS is FOR ALL) → no RLS
-- changes. Also widens the notifications type CHECK to add 'live_lesson' for the
-- "lesson is starting" parent bell (see 113 for why the whole list is rebuilt).
--
-- BACKFILL (mirrors 114's has_hifz reasoning): default 'in_person' would HIDE the
-- live-lesson button from classes that ALREADY run live lessons. So any class with
-- an existing madrasa_sessions row is backfilled to 'hybrid' (live lesson stays
-- available). Remove the backfill if you'd rather every existing class start
-- in_person and opt back in manually.
-- ====================================================================

alter table public.madrasa_classes
  add column if not exists delivery_mode text not null default 'in_person'
    check (delivery_mode in ('in_person', 'remote', 'hybrid'));

alter table public.madrasa_enrollments
  add column if not exists attends_remotely boolean not null default false;

-- One-time backfill: classes that have run a live lesson → hybrid (keep the button).
update public.madrasa_classes
   set delivery_mode = 'hybrid'
 where delivery_mode = 'in_person'
   and id in (select distinct class_id from public.madrasa_sessions);

-- 'live_lesson' notification type (full union + the new type).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'homework', 'report', 'attendance', 'reward', 'cover_request', 'message', 'system',
    'scholar_application', 'mosque_application', 'mosque_claim', 'flag', 'dbs_order',
    'photo', 'waitlist', 'live_lesson'
  ));

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        select column_name, data_type, is_nullable, column_default
--          from information_schema.columns
--          where (table_name = 'madrasa_classes' and column_name = 'delivery_mode')
--             or (table_name = 'madrasa_enrollments' and column_name = 'attends_remotely');   -- 2 rows
--        -- backfill: every class with a session must now be hybrid (expect 0)
--        select count(*) from public.madrasa_classes c
--          where c.delivery_mode = 'in_person'
--            and c.id in (select distinct class_id from public.madrasa_sessions);
--        -- CHECK includes 'live_lesson'
--        select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_type_check';
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
