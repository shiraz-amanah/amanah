-- 087_notifications.sql — Session AN (in-app notifications feed / bell)
-- ====================================================================
-- A per-user notifications feed powering the header bell. Rows are written by
-- SECURITY DEFINER triggers on the six source events (homework, reports,
-- attendance, rewards, cover requests, messages) so notifications fan out to the
-- right recipients regardless of which client path created the event — and so a
-- user can never insert into another user's feed (no INSERT policy; the definer
-- triggers bypass RLS).
--
-- SAFETY: every trigger wraps its work in a BEGIN/EXCEPTION block, so a
-- notification failure can NEVER block or roll back the core action it rides on
-- (e.g. a bad notify must not stop a message being sent). Triggers are AFTER and
-- return NULL.
--
-- Recipients:
--   homework      → parents of active-enrolled students in the class
--   report        → the student's parent, when published (published_at set)
--   attendance    → the student's parent, when marked 'absent'
--   reward        → the student's parent (all types)
--   cover_request → the scholar on create; the mosque owner on confirm/decline
--   message       → the other (non-muted) conversation participants
-- ====================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,  -- recipient
  type       text not null
    check (type in ('homework', 'report', 'attendance', 'reward', 'cover_request', 'message', 'system')),
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,   -- client routing payload (ids/tab)
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx   on public.notifications(user_id, created_at desc);
-- Fast unread badge count.
create index if not exists notifications_unread_idx  on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Users read / mark-read / dismiss their OWN notifications. There is NO insert
-- policy: rows are only ever created by the definer triggers below.
create policy "Users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "Users update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete own notifications"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Internal helper for single-recipient inserts. Owned by the migration role;
-- callable only from the definer triggers (not granted to anon/authenticated).
create or replace function public.create_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));
end; $$;
revoke all on function public.create_notification(uuid, text, text, text, jsonb) from public;

-- ---- homework → active-enrolled students' parents ----
create or replace function public.notify_on_homework() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.notifications (user_id, type, title, body, data)
    select distinct st.profile_id, 'homework', 'New homework set', coalesce(NEW.title, ''),
           jsonb_build_object('homework_id', NEW.id, 'class_id', NEW.class_id, 'mosque_id', NEW.mosque_id)
    from public.madrasa_enrollments en
    join public.students st on st.id = en.student_id
    where en.class_id = NEW.class_id and en.status = 'active' and st.profile_id is not null;
  exception when others then null; end;
  return null;
end; $$;
drop trigger if exists notify_homework on public.madrasa_homework;
create trigger notify_homework after insert on public.madrasa_homework
  for each row execute function public.notify_on_homework();

-- ---- report → the student's parent, on publish ----
create or replace function public.notify_on_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent uuid;
begin
  begin
    if NEW.published_at is not null and (TG_OP = 'INSERT' or OLD.published_at is null) then
      select profile_id into v_parent from public.students where id = NEW.student_id;
      perform public.create_notification(v_parent, 'report', 'New progress report',
        coalesce(NEW.term, '') || ' report is ready to view',
        jsonb_build_object('report_id', NEW.id, 'student_id', NEW.student_id, 'class_id', NEW.class_id));
    end if;
  exception when others then null; end;
  return null;
end; $$;
drop trigger if exists notify_report on public.madrasa_reports;
create trigger notify_report after insert or update on public.madrasa_reports
  for each row execute function public.notify_on_report();

-- ---- attendance → the student's parent, when marked absent ----
create or replace function public.notify_on_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent uuid;
begin
  begin
    if NEW.status = 'absent' and (TG_OP = 'INSERT' or OLD.status is distinct from 'absent') then
      select profile_id into v_parent from public.students where id = NEW.student_id;
      perform public.create_notification(v_parent, 'attendance', 'Attendance update',
        'Your child was marked absent on ' || to_char(NEW.session_date, 'DD Mon YYYY'),
        jsonb_build_object('student_id', NEW.student_id, 'class_id', NEW.class_id, 'session_date', NEW.session_date));
    end if;
  exception when others then null; end;
  return null;
end; $$;
drop trigger if exists notify_attendance on public.madrasa_attendance;
create trigger notify_attendance after insert or update on public.madrasa_attendance
  for each row execute function public.notify_on_attendance();

-- ---- reward → the student's parent (POSITIVE types only) ----
-- warning/concern are deliberately excluded — those are handled privately by the
-- teacher/admin, not surfaced as a parent notification.
create or replace function public.notify_on_reward() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent uuid;
begin
  begin
    if NEW.type in ('star', 'merit', 'achievement') then
      select profile_id into v_parent from public.students where id = NEW.student_id;
      perform public.create_notification(v_parent, 'reward', 'New reward earned',
        coalesce(NEW.note, initcap(NEW.type)),
        jsonb_build_object('reward_id', NEW.id, 'student_id', NEW.student_id, 'reward_type', NEW.type));
    end if;
  exception when others then null; end;
  return null;
end; $$;
drop trigger if exists notify_reward on public.madrasa_rewards;
create trigger notify_reward after insert on public.madrasa_rewards
  for each row execute function public.notify_on_reward();

-- ---- cover request → scholar on create, mosque owner on confirm/decline ----
create or replace function public.notify_on_cover_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  begin
    if TG_OP = 'INSERT' then
      select user_id into v_user from public.scholars where id = NEW.scholar_id;
      perform public.create_notification(v_user, 'cover_request', 'New cover request',
        'A mosque has requested you for cover',
        jsonb_build_object('cover_request_id', NEW.id, 'mosque_id', NEW.mosque_id));
    elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status and NEW.status in ('confirmed', 'declined') then
      select user_id into v_user from public.mosques where id = NEW.mosque_id;
      perform public.create_notification(v_user, 'cover_request', 'Cover request ' || NEW.status,
        'A scholar has ' || NEW.status || ' your cover request',
        jsonb_build_object('cover_request_id', NEW.id, 'scholar_id', NEW.scholar_id));
    end if;
  exception when others then null; end;
  return null;
end; $$;
drop trigger if exists notify_cover_request on public.cover_requests;
create trigger notify_cover_request after insert or update on public.cover_requests
  for each row execute function public.notify_on_cover_request();

-- ---- message → the other (non-muted) conversation participants ----
create or replace function public.notify_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if NEW.deleted_at is null then
      insert into public.notifications (user_id, type, title, body, data)
      select cp.user_id, 'message', 'New message', left(coalesce(NEW.body, ''), 140),
             jsonb_build_object('conversation_id', NEW.conversation_id)
      from public.conversation_participants cp
      where cp.conversation_id = NEW.conversation_id
        and cp.user_id <> NEW.sender_id
        and coalesce(cp.notifications_muted, false) = false;
    end if;
  exception when others then null; end;
  return null;
end; $$;
drop trigger if exists notify_message on public.messages;
create trigger notify_message after insert on public.messages
  for each row execute function public.notify_on_message();

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor (NOTIFY included above).
--   2. Probe:
--        \d public.notifications
--        select count(*) from pg_policies where tablename = 'notifications';  -- expect 3
--        select tgname from pg_trigger where tgrelid = 'public.madrasa_homework'::regclass and not tgisinternal;
--        -- repeat for madrasa_reports / madrasa_attendance / madrasa_rewards / cover_requests / messages
--        select count(*) from pg_proc where proname like 'notify_on_%';  -- expect 6
--   3. End-to-end smoke (each should add a row to the recipient's feed, and must
--      NOT error the source write):
--        - set a homework on a class with an active enrolment → parent gets a row
--        - publish a report → parent gets a row
--        - mark a student absent → parent gets a row
--        - award a reward → parent gets a row
--        - create a cover_request → scholar gets a row; confirm it → owner gets one
--        - send a message → the other participant gets a row
--   4. Hard refresh -> repeat on prod.
-- ====================================================================
