-- 112_madrasa_waitlist_accept_fee.sql
-- ====================================================================
-- Auto-bill on waitlist acceptance. When a parent accepts an offer and the child
-- is enrolled, they must be picked up by any fee already set for that class —
-- otherwise a mid-term joiner silently escapes billing until the admin notices.
--
-- This CANNOT live in the data layer: acceptWaitlistOffer runs in the PARENT's
-- session, and madrasa_fees / madrasa_fee_records are owner-only under RLS (111),
-- so a client-side "read fee, insert record" is a silent no-op (select returns 0
-- rows, insert is denied). The enrolment insert only works because
-- madrasa_waitlist_accept is SECURITY DEFINER — so the fee record must be created
-- in the SAME definer function, where it runs with elevated privilege and already
-- holds class_id / student_id / mosque_id.
--
-- "Current term" has no schema marker (madrasa_fees has only term_label/due_date/
-- grace_period_days), so an OPEN fee is defined as: due_date is null, OR the
-- payment window (due_date + grace_period_days) has not yet closed. A joiner is
-- billed for the running/upcoming term but NOT for historical terms whose window
-- already lapsed. Idempotent via the (fee_id, student_id) unique index — a re-enrol
-- (reactivate) never double-bills.
--
-- Only the enrolment + auto-bill block is new; the auth/freshness guards and the
-- signature (madrasa_waitlist_accept(uuid) returns uuid) are unchanged from 081.
-- ====================================================================

create or replace function public.madrasa_waitlist_accept(p_waitlist_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  w       record;
  v_enrol uuid;
begin
  select * into w from public.madrasa_waitlist where id = p_waitlist_id;
  if not found then raise exception 'waitlist row not found'; end if;

  if not exists (select 1 from public.students s
                 where s.id = w.student_id and s.profile_id = auth.uid()) then
    raise exception 'not authorised';
  end if;

  -- Stale/absent offers are refused here; reaping is make_next_offer's job.
  if w.status <> 'offered' or w.offer_expires_at is null or w.offer_expires_at < now() then
    raise exception 'offer is not open';
  end if;

  insert into public.madrasa_enrollments (class_id, student_id, mosque_id, status)
    values (w.class_id, w.student_id, w.mosque_id, 'active')
  on conflict (class_id, student_id) do update set status = 'active', enrolled_at = now()
  returning id into v_enrol;

  -- Auto-bill: create a fee record for every OPEN fee on this class (due_date null,
  -- or due_date + grace not yet past). Closed/historical terms are skipped. Runs
  -- with definer rights (parent has no RLS access to the fees tables). Idempotent.
  insert into public.madrasa_fee_records (fee_id, student_id, mosque_id, amount_due, status)
    select f.id, w.student_id, f.mosque_id, f.amount,
           case when f.amount = 0 then 'paid' else 'outstanding' end
    from public.madrasa_fees f
    where f.class_id = w.class_id
      and (f.due_date is null or (f.due_date + f.grace_period_days) >= current_date)
  on conflict (fee_id, student_id) do nothing;

  update public.madrasa_waitlist set status = 'enrolled', updated_at = now() where id = p_waitlist_id;
  return v_enrol;
end;
$$;

-- Grants unchanged from 081 (re-applied for self-documentation; create-or-replace
-- preserves them anyway). Parent calls it on their own child; anon may not.
revoke all     on function public.madrasa_waitlist_accept(uuid) from public;
revoke execute on function public.madrasa_waitlist_accept(uuid) from anon;
grant  execute on function public.madrasa_waitlist_accept(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- still exactly one madrasa_waitlist_accept, still SECURITY DEFINER
--        select oid::regprocedure, prosecdef from pg_proc where proname = 'madrasa_waitlist_accept';
--        -- grants intact
--        select has_function_privilege('anon','public.madrasa_waitlist_accept(uuid)','execute')          as anon_x,   -- f
--               has_function_privilege('authenticated','public.madrasa_waitlist_accept(uuid)','execute')  as auth_x,   -- t
--               has_function_privilege('service_role','public.madrasa_waitlist_accept(uuid)','execute')   as svc_x;    -- t
--   3. Functional check (optional, on a dev fixture): offer + accept a child on a
--      class that has an OPEN madrasa_fees row, then confirm a matching
--      madrasa_fee_record now exists:
--        select fr.status, fr.amount_due from public.madrasa_fee_records fr
--          join public.madrasa_fees f on f.id = fr.fee_id
--         where fr.student_id = '<student>' and f.class_id = '<class>';
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
