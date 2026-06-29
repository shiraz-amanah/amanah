-- 099_madrasa_photo_notify.sql
-- ====================================================================
-- Per-photo recipient notifications (Session AW). madrasa_photos.visible_to
-- (uuid[], migration 080) ALREADY models per-photo recipients — the parent
-- gallery reads via visible_to containment (getStudentPhotos → contains) — so
-- NO recipients column is added here. The only behaviour change app-side is that
-- the uploader now writes the SELECTED consented subset into visible_to instead
-- of every consented student.
--
-- This migration only adds the in-app bell notification for a shared photo,
-- matching the 087 trigger pattern (bell rows are created by SECURITY DEFINER
-- triggers, never by clients — there is no INSERT policy on notifications).
--
-- Two changes:
--   1. Extend notifications.type CHECK with 'photo' (087 didn't include it).
--   2. notify_on_photo() AFTER INSERT on madrasa_photos → one bell row per
--      DISTINCT parent of a student in visible_to (skips students with no linked
--      parent account). Wrapped in BEGIN/EXCEPTION so a notify failure can NEVER
--      roll back the photo insert (the 087 safety contract). Trigger is AFTER and
--      returns NULL.
--
-- Email (the madrasa_photo_shared intent) is app-side via send-transactional —
-- NOT a DB trigger — so it is not touched here. Non-consented students are
-- already excluded app-side (never placed in visible_to), so they are excluded
-- from this trigger's fan-out for free.
--
-- Depends on: 080 (madrasa_photos.visible_to), 087 (notifications + the
-- create_notification helper + the type CHECK this migration extends).
-- Apply dev first, probe, then prod, probe. NOT auto-applied.
-- ====================================================================

-- 1. Allow the new 'photo' notification type. 087 created this as an inline
--    column CHECK, so its deterministic name is notifications_type_check. The
--    first probe below confirms the recreated constraint includes 'photo' and
--    that exactly one such constraint exists (a name mismatch would leave the
--    old one in place and still block 'photo').
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('homework', 'report', 'attendance', 'reward', 'cover_request', 'message', 'system', 'photo'));

-- 2. Fan a bell notification out to the parents of the photo's recipients.
create or replace function public.notify_on_photo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.notifications (user_id, type, title, body, data)
    select distinct st.profile_id, 'photo', 'New class photo',
           'A new class photo has been shared with you',
           jsonb_build_object('photo_id', NEW.id, 'class_id', NEW.class_id, 'mosque_id', NEW.mosque_id)
    from public.students st
    where st.id = any(NEW.visible_to) and st.profile_id is not null;
  exception when others then null; end;
  return null;
end; $$;

drop trigger if exists notify_photo on public.madrasa_photos;
create trigger notify_photo after insert on public.madrasa_photos
  for each row execute function public.notify_on_photo();

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, probe, then prod, probe):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- type CHECK now includes 'photo' (and is the only such constraint):
--        select conname, pg_get_constraintdef(oid) from pg_constraint
--          where conrelid = 'public.notifications'::regclass
--            and conname = 'notifications_type_check';        -- 1 row, def includes 'photo'
--        -- trigger + function exist:
--        select tgname from pg_trigger
--          where tgrelid = 'public.madrasa_photos'::regclass
--            and not tgisinternal;                            -- includes notify_photo
--        select proname from pg_proc where proname = 'notify_on_photo';  -- 1 row
--   3. Smoke (must add a row to the recipient's feed and must NOT error the
--      photo insert): insert a madrasa_photos row with visible_to = {a consented
--      student whose parent has a linked account} → that parent gets exactly one
--      'photo' notification; a parent of a NON-selected student gets none.
--   4. NOTIFY pgrst, 'reload schema';  (included above)
--   5. Hard refresh, then repeat on prod.
-- ====================================================================
