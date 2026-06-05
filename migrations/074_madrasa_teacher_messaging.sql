-- 074_madrasa_teacher_messaging.sql
-- ====================================================================
-- Madrasa Phase 2a-ii — individual parent↔teacher messaging. REUSES the
-- existing conversations/messages infra (004) — realtime, unread (last_read_at),
-- soft-delete and optimistic send all come for free — rather than a parallel
-- madrasa table. Two changes are needed:
--
--   1. The conversation_participants.role CHECK enum has no 'teacher'. A teacher
--      is a mosque_staff member (a normal profile) acting in a class context, so
--      add 'teacher' to the allowed roles. (Forgetting this = 23514 on insert,
--      same class of bug as the saves.item_type CHECK.)
--
--   2. A parent cannot resolve the teacher's user id to open a thread: migration
--      030 grants NO parent read on mosque_staff (owner / staff-self / platform-
--      admin only). So a SECURITY DEFINER RPC returns the class teacher's
--      profile_id, but ONLY to an enrolled child's parent (or the mosque owner /
--      admin). It reads madrasa_classes + mosque_staff WITHOUT RLS (definer), so
--      no policy re-entry — the 068/069 lesson.
--
-- The teacher→parent direction needs no new grant: the teacher already reads the
-- roster (072) and students.profile_id is a column on rows they can see.
-- ====================================================================

-- 1. Relax the participant-role CHECK to include 'teacher'. Name-agnostic drop
--    (the inline CHECK from 004 is auto-named) then re-add a named constraint.
do $$
declare cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
    and rel.relname = 'conversation_participants'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%';
  if cname is not null then
    execute format('alter table public.conversation_participants drop constraint %I', cname);
  end if;
end $$;

alter table public.conversation_participants
  add constraint conversation_participants_role_check
  check (role in ('parent', 'scholar', 'mosque_admin', 'student', 'teacher'));

-- 2. Resolve a class's teacher user id, gated to people allowed to message them.
create or replace function public.madrasa_class_teacher_user(p_class uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select s.profile_id
  from public.madrasa_classes c
  join public.mosque_staff s on s.id = c.teacher_staff_id
  where c.id = p_class
    and (
      public.madrasa_parent_can_see_class(p_class)
      or c.mosque_id in (select id from public.mosques where user_id = auth.uid())
      or public.is_admin()
    );
$$;
revoke all on function public.madrasa_class_teacher_user(uuid) from public;
grant execute on function public.madrasa_class_teacher_user(uuid) to authenticated;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe:
--        select pg_get_constraintdef(oid) from pg_constraint
--          where conname = 'conversation_participants_role_check';   -- includes 'teacher'
--        select proname, prosecdef from pg_proc where proname = 'madrasa_class_teacher_user';
--   3. Re-run the 2a-ii smoke — parent resolves teacher + opens a thread; a
--      non-enrolled parent's RPC call returns null; 'teacher'-role insert OK.
--   4. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';
