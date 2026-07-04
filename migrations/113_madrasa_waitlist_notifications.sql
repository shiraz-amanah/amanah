-- 113_madrasa_waitlist_notifications.sql
-- ====================================================================
-- Smart, notification-driven waiting list. Six of the seven touchpoints are
-- SECURITY DEFINER triggers on madrasa_waitlist + madrasa_enrollments, riding the
-- existing 087 notifications feed / bell. (Touchpoint 7, the monthly position
-- email, is a Vercel Cron intent — no DB work.)
--
-- Follows the 087/095 pattern exactly: AFTER triggers, SECURITY DEFINER (so a row
-- can be written to a recipient's feed regardless of who fired the event), each
-- body wrapped in BEGIN/EXCEPTION so a notify failure can NEVER roll back the core
-- action it rides on (a waitlist insert, an enrolment withdrawal, the accept RPC).
-- Triggers RETURN NULL (they are AFTER).
--
-- Recipients (owner = mosques.user_id; parent = students.profile_id):
--   1 join       → owner : "<student> for <class> — now #<rank> in the queue."
--   2 seat opens → owner : "A place has opened in <class> — <N> waiting. Offer a seat?"
--   3 offered    → parent: "A place has been offered … accept within 48 hours."
--   4 moved up   → parent: "<student> has moved up to #<rank> …"  (all queue-shift paths)
--   5 accepted   → owner : "<student> has accepted … now enrolled."   (status 'enrolled')
--   6 expired    → owner : "The offer for <student> … expired."       (fires at the lazy reap)
--
-- SCHEMA NOTES (spec said otherwise — these match the real columns):
--   * enrolment withdrawal is status 'withdrawn' (068 CHECK) or a row DELETE — not 'inactive'.
--   * accept sets madrasa_waitlist.status = 'enrolled' (112) — not 'accepted'.
--   * a new 'waitlist' notifications.type is added below.
-- All owner waitlist notifications route to Madrasah → Waiting list (client side).
-- ====================================================================

-- 1. Allow the new 'waitlist' type. This is the FULL UNION of every type any
--    migration has ever intended: 087 (base 7) + 095 (5 admin) + 099 ('photo') +
--    'waitlist'. NB: 099 rebuilt the constraint but dropped the 095 admin types,
--    so the live constraint is missing them (a latent regression — the 095 admin
--    triggers would fail if they fired). Rebuilding with the union RESTORES those
--    admin types as well as adding 'photo' and 'waitlist'. Probed dev before this:
--    live rows use attendance/message/photo/reward, all inside the union below.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'homework', 'report', 'attendance', 'reward', 'cover_request', 'message', 'system',
    'scholar_application', 'mosque_application', 'mosque_claim', 'flag', 'dbs_order',
    'photo',
    'waitlist'
  ));

-- 2. Move-up fan-out helper (touchpoint 4). Notifies every still-waiting parent
--    BEHIND a departed queue position of their new live rank. Reused by the
--    madrasa_waitlist UPDATE-leaves-queue and DELETE branches.
create or replace function public.notify_waitlist_moved_up(p_class uuid, p_after_position int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  select st.profile_id, 'waitlist', 'You''ve moved up the waiting list',
         'Good news — ' || coalesce(st.name, 'your child') || ' has moved up to #' ||
           (select count(*) from public.madrasa_waitlist w2
              where w2.class_id = w.class_id and w2.status = 'waiting' and w2.position <= w.position)::text ||
           ' on the waiting list for ' || coalesce(c.name, 'the class') || '.',
         jsonb_build_object('kind', 'moved_up', 'mosque_id', w.mosque_id, 'class_id', w.class_id, 'student_id', w.student_id)
  from public.madrasa_waitlist w
  join public.students st       on st.id = w.student_id
  join public.madrasa_classes c on c.id = w.class_id
  where w.class_id = p_class and w.status = 'waiting' and w.position > p_after_position
    and st.profile_id is not null;
end;
$$;
revoke all on function public.notify_waitlist_moved_up(uuid, int) from public, anon, authenticated;

-- 3. madrasa_waitlist trigger — touchpoints 1, 3, 4, 5, 6. -------------------
create or replace function public.notify_on_waitlist() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner   uuid;
  v_parent  uuid;
  v_student text;
  v_class   text;
  v_mosque  text;
  v_rank    int;
begin
  begin
    if TG_OP = 'INSERT' then
      -- Touchpoint 1: a parent joined → owner bell, with the live queue rank.
      if NEW.status = 'waiting' then
        select m.user_id, m.name, c.name, s.name
          into v_owner, v_mosque, v_class, v_student
          from public.madrasa_classes c
          join public.mosques m on m.id = c.mosque_id
          left join public.students s on s.id = NEW.student_id
          where c.id = NEW.class_id;
        select count(*) into v_rank from public.madrasa_waitlist
          where class_id = NEW.class_id and status = 'waiting' and position <= NEW.position;
        perform public.create_notification(v_owner, 'waitlist', 'New waiting list request',
          coalesce(v_student, 'A student') || ' for ' || coalesce(v_class, 'a class') || ' — now #' || v_rank || ' in the queue.',
          jsonb_build_object('kind', 'request', 'mosque_id', NEW.mosque_id, 'class_id', NEW.class_id, 'student_id', NEW.student_id));
      end if;

    elsif TG_OP = 'UPDATE' then
      -- Resolve names/recipients once for the branches below.
      select m.user_id, m.name, c.name, s.name, s.profile_id
        into v_owner, v_mosque, v_class, v_student, v_parent
        from public.madrasa_classes c
        join public.mosques m on m.id = c.mosque_id
        left join public.students s on s.id = NEW.student_id
        where c.id = NEW.class_id;

      -- Touchpoint 3: offer made → parent bell (email is sent separately by the handler).
      if NEW.status = 'offered' and OLD.status is distinct from 'offered' then
        perform public.create_notification(v_parent, 'waitlist', 'A place has been offered',
          'A place has been offered for ' || coalesce(v_student, 'your child') || ' in ' || coalesce(v_class, 'the class') ||
            ' at ' || coalesce(v_mosque, 'the madrasah') || '. Accept within 48 hours.',
          jsonb_build_object('kind', 'offered', 'mosque_id', NEW.mosque_id, 'class_id', NEW.class_id, 'student_id', NEW.student_id));
      end if;

      -- Touchpoint 5: accepted (status 'enrolled') → owner bell.
      if NEW.status = 'enrolled' and OLD.status is distinct from 'enrolled' then
        perform public.create_notification(v_owner, 'waitlist', 'Waiting list place accepted',
          coalesce(v_student, 'A student') || ' has accepted their place in ' || coalesce(v_class, 'the class') || ' and is now enrolled.',
          jsonb_build_object('kind', 'accepted', 'mosque_id', NEW.mosque_id, 'class_id', NEW.class_id, 'student_id', NEW.student_id));
      end if;

      -- Touchpoint 6: offer expired at the lazy reap → owner bell.
      if NEW.status = 'expired' and OLD.status = 'offered' then
        perform public.create_notification(v_owner, 'waitlist', 'Waiting list offer expired',
          'The offer for ' || coalesce(v_student, 'a student') || ' in ' || coalesce(v_class, 'the class') ||
            ' expired without a response — the place is free to offer again.',
          jsonb_build_object('kind', 'expired', 'mosque_id', NEW.mosque_id, 'class_id', NEW.class_id, 'student_id', NEW.student_id));
      end if;

      -- Touchpoint 4: the row LEFT the active queue (waiting/offered → terminal) →
      -- everyone behind moves up. (A plain waiting→offered keeps the slot, so no move.)
      if OLD.status in ('waiting', 'offered') and NEW.status in ('enrolled', 'declined', 'expired', 'cancelled') then
        perform public.notify_waitlist_moved_up(OLD.class_id, OLD.position);
      end if;

    elsif TG_OP = 'DELETE' then
      -- A waiting/offered row was deleted → everyone behind moves up.
      if OLD.status in ('waiting', 'offered') then
        perform public.notify_waitlist_moved_up(OLD.class_id, OLD.position);
      end if;
    end if;
  exception when others then null; end;
  return null;
end; $$;

drop trigger if exists notify_waitlist on public.madrasa_waitlist;
create trigger notify_waitlist after insert or update or delete on public.madrasa_waitlist
  for each row execute function public.notify_on_waitlist();

-- 4. madrasa_enrollments trigger — touchpoint 2 (a place opens up). ----------
create or replace function public.notify_on_enrollment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner   uuid;
  v_class   text;
  v_waiting int;
  v_row     record;
begin
  begin
    -- A place opens only when an ACTIVE enrolment is withdrawn or deleted.
    if TG_OP = 'UPDATE' then
      if not (OLD.status = 'active' and NEW.status = 'withdrawn') then return null; end if;
      v_row := NEW;
    else -- DELETE
      if OLD.status <> 'active' then return null; end if;
      v_row := OLD;
    end if;

    select count(*) into v_waiting from public.madrasa_waitlist
      where class_id = v_row.class_id and status = 'waiting';
    if v_waiting = 0 then return null; end if;  -- no one waiting → nothing to offer

    select m.user_id, c.name into v_owner, v_class
      from public.madrasa_classes c
      join public.mosques m on m.id = c.mosque_id
      where c.id = v_row.class_id;

    perform public.create_notification(v_owner, 'waitlist', 'A place has opened up',
      'A place has opened in ' || coalesce(v_class, 'a class') || ' — ' || v_waiting ||
        ' student' || case when v_waiting = 1 then '' else 's' end || ' waiting. Offer a seat?',
      jsonb_build_object('kind', 'place_opened', 'mosque_id', v_row.mosque_id, 'class_id', v_row.class_id));
  exception when others then null; end;
  return null;
end; $$;

drop trigger if exists notify_enrollment_change on public.madrasa_enrollments;
create trigger notify_enrollment_change after update or delete on public.madrasa_enrollments
  for each row execute function public.notify_on_enrollment_change();

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- type CHECK now allows 'waitlist'
--        select conname from pg_constraint where conname = 'notifications_type_check';                 -- 1 row
--        -- functions are SECURITY DEFINER (prosecdef = t)
--        select proname, prosecdef from pg_proc
--          where proname in ('notify_waitlist_moved_up','notify_on_waitlist','notify_on_enrollment_change');
--        -- triggers exist
--        select tgname from pg_trigger where tgname = 'notify_waitlist';            -- on madrasa_waitlist
--        select tgname from pg_trigger where tgname = 'notify_enrollment_change';   -- on madrasa_enrollments
--   3. Functional smoke (each adds a feed row for the recipient; none may error the core write):
--        - insert a waiting row            → owner gets 'request'
--        - withdraw an active enrolment on a class with waiting rows → owner gets 'place_opened'
--        - rpc madrasa_waitlist_offer_specific on a waiting row      → parent gets 'offered'
--        - accept an offer (status→enrolled)                         → owner gets 'accepted' + parents behind get 'moved_up'
--        - expire an offer then rpc make_next_offer (reap)           → owner gets 'expired' + parents behind get 'moved_up'
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
