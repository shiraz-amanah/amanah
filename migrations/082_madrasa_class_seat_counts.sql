-- 082_madrasa_class_seat_counts.sql
-- ====================================================================
-- Madrasa Phase 3A — public seat counts for the parent browse, so a parent can
-- see when a class is full and is shown "Join waitlist" instead of "Enrol".
--
-- A parent CANNOT read other families' enrolments (madrasa_enrollments RLS =
-- own-children / own-mosque), so a client-side count is impossible. This exposes
-- ONLY aggregate counts (no rows, no PII) via a SECURITY DEFINER function — it
-- must be definer so the aggregate sees all rows; a non-definer call would count
-- 0 for anon under RLS. Returns, per ACTIVE class:
--   active_count  — active enrolments (the "X/Y enrolled" the UI shows)
--   offered_count — outstanding waitlist offers (also hold a seat)
-- The UI treats a class as full when active_count + offered_count >= capacity,
-- mirroring madrasa_waitlist_make_next_offer's capacity gate (081) so an enrol
-- can't grab a seat that's mid-offer to a waitlisted child.
--
-- Counts only → safe to grant to anon + authenticated (the browse is public).
-- ====================================================================

create or replace function public.madrasa_class_active_counts()
returns table (class_id uuid, active_count int, offered_count int)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, coalesce(e.n, 0)::int, coalesce(o.n, 0)::int
  from public.madrasa_classes c
  left join (
    select class_id, count(*) n from public.madrasa_enrollments where status = 'active' group by class_id
  ) e on e.class_id = c.id
  left join (
    select class_id, count(*) n from public.madrasa_waitlist where status = 'offered' group by class_id
  ) o on o.class_id = c.id
  where c.status = 'active';
$$;

-- Aggregate counts only (no PII) → readable by the public browse.
revoke all     on function public.madrasa_class_active_counts() from public;
grant  execute on function public.madrasa_class_active_counts() to anon, authenticated;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        select proname, prosecdef from pg_proc
--          where proname = 'madrasa_class_active_counts';   -- prosecdef=t
--        -- counts visible to the public (run as anon, e.g. via REST rpc):
--        select * from public.madrasa_class_active_counts() limit 5;
--        -- grant check:
--        select r.rolname, has_function_privilege(r.rolname,
--                 'public.madrasa_class_active_counts()', 'EXECUTE') as can_exec
--          from (values ('anon'),('authenticated'),('service_role')) r(rolname);
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';
