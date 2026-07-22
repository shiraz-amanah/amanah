-- 185_madrasa_set_class_schedule.sql — Workforce/Timetable rebuild, PHASE 1
-- ============================================================================
-- Transactional replace of a class's weekly schedule — the SAFE dual-write.
-- Deletes the class's madrasa_class_schedule rows and re-inserts the given set
-- in ONE transaction, then regenerates the derived madrasa_classes.schedule
-- jsonb mirror to match. Because it's one transaction:
--   * no self-clash — a moved session's old row is gone before the new one is
--     inserted, so the teacher EXCLUDE (181) never fires a class against itself;
--   * a REAL cross-class teacher clash raises 23P01 and rolls back the whole
--     function, leaving the class's schedule (rows AND mirror) untouched — the
--     client surfaces the clash and the class is never left half-written.
--
-- SECURITY DEFINER because it writes madrasa_class_schedule (owner/admin RLS)
-- and the mirror on madrasa_classes; ownership is gated INSIDE (owner of the
-- class's mosque, or platform admin), mirroring 068. teacher_staff_id and room
-- are taken from the class row (class-level today), not the caller — an owner
-- can't inject another class or forge a teacher. The EXCLUDE constraint is
-- enforced regardless of SECURITY DEFINER, so clash detection still holds.
--
-- p_sessions shape (client maps day names -> 0..6 before calling):
--   [ { "day_of_week": 0..6, "start_time": "HH:MM", "end_time": "HH:MM" }, ... ]
-- Empty array clears the class's schedule (valid — an unscheduled class).
-- ============================================================================

create or replace function public.madrasa_set_class_schedule(p_class_id uuid, p_sessions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_mosque uuid;
  v_teacher uuid;
  v_room   text;
  v_mirror jsonb;
begin
  select mosque_id, teacher_staff_id, room
    into v_mosque, v_teacher, v_room
    from madrasa_classes where id = p_class_id;
  if v_mosque is null then raise exception 'class_not_found'; end if;
  if not (exists (select 1 from mosques where id = v_mosque and user_id = v_uid) or public.is_admin())
    then raise exception 'not_authorised'; end if;

  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'p_sessions must be a jsonb array';
  end if;

  -- Replace rows (transactional; delete-before-insert avoids self-clash).
  delete from madrasa_class_schedule where class_id = p_class_id;

  insert into madrasa_class_schedule
    (mosque_id, class_id, teacher_staff_id, day_of_week, start_time, end_time, room)
  select v_mosque, p_class_id, v_teacher,
         (e->>'day_of_week')::smallint,
         (e->>'start_time')::time,
         (e->>'end_time')::time,
         v_room
    from jsonb_array_elements(p_sessions) e;

  -- Regenerate the derived jsonb mirror ([{day,start,end}], day as full name)
  -- so legacy readers stay consistent with the rows.
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', case (e->>'day_of_week')::int
                    when 0 then 'Monday'   when 1 then 'Tuesday' when 2 then 'Wednesday'
                    when 3 then 'Thursday' when 4 then 'Friday'  when 5 then 'Saturday'
                    when 6 then 'Sunday' end,
           'start', e->>'start_time',
           'end',   e->>'end_time')
         order by (e->>'day_of_week')::int, (e->>'start_time')), '[]'::jsonb)
    into v_mirror
    from jsonb_array_elements(p_sessions) e;

  update madrasa_classes set schedule = v_mirror, updated_at = now() where id = p_class_id;
end;
$$;

-- Revoke from anon TOO, not just public: Supabase's default privileges on the
-- public schema explicitly grant EXECUTE to anon on every new function, which a
-- bare `from public` leaves intact (this is how suspend_staff once became
-- anon-callable — see 177/178).
revoke all on function public.madrasa_set_class_schedule(uuid, jsonb) from public, anon;
grant execute on function public.madrasa_set_class_schedule(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- APPLY CHECKLIST (dev first — functional + clash + authz tests, then prod):
--
-- 1. Apply this file.
--
-- 2. Presence + grants (anon must NOT have execute):
--      select p.proname, p.prosecdef,
--             has_function_privilege('authenticated','public.madrasa_set_class_schedule(uuid,jsonb)','execute') as auth_exec,
--             has_function_privilege('anon','public.madrasa_set_class_schedule(uuid,jsonb)','execute')          as anon_exec
--        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.proname='madrasa_set_class_schedule';
--      -- expect prosecdef=t, auth_exec=t, anon_exec=f
--
-- 3. FUNCTIONAL + ROLLBACK-SAFE clash test (run as the mosque OWNER via the app,
--    or in a transaction impersonating them; ROLLBACK so nothing persists):
--    - set a class's schedule to a two-session array → rows replaced, mirror
--      matches jsonb_agg, madrasa_classes.schedule updated.
--    - set an OVERLAPPING session for the SAME teacher in ANOTHER class → the
--      call raises 23P01 and the first class's rows/mirror are UNCHANGED.
--    - re-run the same valid array → idempotent (same rows, no error).
--
-- 4. HASH: record md5(prosrc) on dev and match on prod:
--      select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.proname='madrasa_set_class_schedule';
--
-- 5. NOTIFY included.
-- ============================================================================
