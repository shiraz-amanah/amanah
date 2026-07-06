-- 121_parent_fee_records_read.sql
-- ====================================================================
-- Parent-facing read of their OWN children's madrasah fee records — the
-- prerequisite for the parent Pay flow (Session BO). Migration 111 gave
-- madrasa_fee_records no parent policy ("admin-only for now"), and its `notes`
-- column is internal admin free-text (hardship, chaser notes) that parents must
-- NOT see. RLS is row-level (can't hide a column), so instead of a blanket parent
-- SELECT policy we expose a SECURITY DEFINER RPC that returns only parent-safe
-- columns + the joined fee/class labels. Mirrors the module's other parent-read
-- RPCs (get_my_lesson_summaries, get_mosque_waitlist).
--
-- Scope: the caller's children only (students.profile_id = auth.uid()). Writes
-- stay owner/service-role only (unchanged).
-- ====================================================================

create or replace function public.get_my_children_fee_records()
returns table (
  id            uuid,
  fee_id        uuid,
  student_id    uuid,
  mosque_id     uuid,
  student_name  text,
  class_name    text,
  term_label    text,
  due_date      date,
  amount_due    numeric,
  amount_paid   numeric,
  currency      text,
  status        text,
  paid_at       timestamptz,
  created_at    timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select fr.id, fr.fee_id, fr.student_id, fr.mosque_id,
         st.name, mc.name, mf.term_label, mf.due_date,
         fr.amount_due, fr.amount_paid, mf.currency, fr.status,
         fr.paid_at, fr.created_at
  from public.madrasa_fee_records fr
  join public.students        st on st.id = fr.student_id
  join public.madrasa_fees    mf on mf.id = fr.fee_id
  join public.madrasa_classes mc on mc.id = mf.class_id
  where st.profile_id = auth.uid()          -- caller's own children only
  order by fr.created_at desc;
$$;

revoke all on function public.get_my_children_fee_records() from public;
revoke execute on function public.get_my_children_fee_records() from anon;
grant execute on function public.get_my_children_fee_records() to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- function exists, SECURITY DEFINER (prosecdef = t)
--        select proname, prosecdef, pg_get_function_arguments(oid) as args
--          from pg_proc where proname = 'get_my_children_fee_records';
--        -- authenticated-only execute (no anon/public)
--        select grantee, privilege_type from information_schema.routine_privileges
--          where routine_name = 'get_my_children_fee_records';
--        -- returns ONLY the caller's children (run from a parent session, not
--        -- service role): select id, student_name, status, amount_due
--        --   from public.get_my_children_fee_records();
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
