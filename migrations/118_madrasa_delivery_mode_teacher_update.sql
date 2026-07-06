-- 118_madrasa_delivery_mode_teacher_update.sql
-- ====================================================================
-- Let a class's assigned TEACHER change its delivery_mode (in_person |
-- remote | hybrid) from the unified register screen — not just the mosque
-- owner. madrasa_classes UPDATE stays owner/admin-only (068); rather than
-- open a broad teacher UPDATE policy on the whole row (which would also let
-- a teacher rename the class, change its capacity, reassign its teacher or
-- flip has_hifz), we expose a SECURITY DEFINER RPC that writes ONE column
-- and nothing else. Authorisation reuses the same definer helper the
-- attendance table already trusts (madrasa_is_class_teacher, 070), OR the
-- mosque owner, OR an admin.
--
-- The RPC returns the updated row so the client can reflect it optimistically
-- (same shape updateMadrasaClass returned). Invalid modes and unauthorised
-- callers raise — the client surfaces the error and rolls back.
-- ====================================================================

create or replace function public.madrasa_set_delivery_mode(p_class uuid, p_mode text)
returns public.madrasa_classes
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.madrasa_classes;
begin
  if p_mode not in ('in_person', 'remote', 'hybrid') then
    raise exception 'invalid delivery_mode: %', p_mode;
  end if;

  -- Authorisation: class teacher (definer helper) OR mosque owner OR admin.
  if not (
    public.madrasa_is_class_teacher(p_class)
    or exists (
      select 1
      from public.madrasa_classes c
      join public.mosques m on m.id = c.mosque_id
      where c.id = p_class and m.user_id = auth.uid()
    )
    or public.is_admin()
  ) then
    raise exception 'not authorised to change this class';
  end if;

  update public.madrasa_classes
     set delivery_mode = p_mode, updated_at = now()
   where id = p_class
   returning * into r;

  if r.id is null then
    raise exception 'class not found: %', p_class;
  end if;

  return r;
end;
$$;

-- anon must be revoked EXPLICITLY, not just via `revoke all from public` — on
-- Supabase the anon role can retain an inherited/default EXECUTE grant, so a bare
-- `revoke ... from public` left anon able to call this. The explicit line below
-- makes re-applies clean with no manual step (confirmed needed on dev + prod).
revoke all on function public.madrasa_set_delivery_mode(uuid, text) from public;
revoke execute on function public.madrasa_set_delivery_mode(uuid, text) from anon;
grant execute on function public.madrasa_set_delivery_mode(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- function exists, is SECURITY DEFINER (prosecdef = true):
--        select proname, prosecdef, pg_get_function_arguments(oid) as args
--          from pg_proc where proname = 'madrasa_set_delivery_mode';   -- 1 row, prosecdef = t
--        -- only authenticated may execute (no anon/public):
--        select grantee, privilege_type
--          from information_schema.routine_privileges
--          where routine_name = 'madrasa_set_delivery_mode';           -- authenticated / EXECUTE
--        -- round-trip on a real class (RUN AS A TEACHER'S session, not service role,
--        -- to exercise the auth branch; pick a class_id you can see):
--        --   select public.madrasa_set_delivery_mode('<class-uuid>', 'hybrid');
--        --   select id, delivery_mode from public.madrasa_classes where id = '<class-uuid>';
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
