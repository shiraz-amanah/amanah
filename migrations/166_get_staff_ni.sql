-- 166_get_staff_ni.sql
-- ====================================================================
-- D3 — owner-only audited NI reveal. NO DDL: address / emergency_contact_name /
-- emergency_contact_phone / ni_number already live on mosque_staff_employment
-- (060); this only adds the reveal RPC. Same pattern as get_staff_salary: reads
-- the sensitive value for the owner, plaintext, and audits the VIEW
-- ('ni_number_viewed'). NI changes are written via the existing employment
-- passthrough (not change-audited — matches the salary model). No RLS change.
-- ====================================================================

begin;

create or replace function public.get_staff_ni(p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid; v_ni text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select e.ni_number, s.mosque_id into v_ni, v_mosque
    from mosque_staff s
    left join mosque_staff_employment e on e.staff_id = s.id
    join mosques m on m.id = s.mosque_id
    where s.id = p_staff_id and m.user_id = v_uid;      -- OWNER ONLY
  if v_mosque is null then raise exception 'not_authorised' using errcode = '42501'; end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque, v_uid, p_staff_id, 'ni_number_viewed', jsonb_build_object('staff_id', p_staff_id));
  return jsonb_build_object('ni_number', v_ni);
end; $$;

revoke all on function public.get_staff_ni(uuid) from public, anon;
grant execute on function public.get_staff_ni(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-166-dev.mjs, then STOP):
--   P1  the four columns already exist on mosque_staff_employment (no ALTER).
--   P2  get_staff_ni prosecdef=true, owner=postgres, anon denied, authenticated granted.
--   P3  behavioural (BEGIN...ROLLBACK, dev-ref): owner → {ni_number} + one
--       ni_number_viewed row; non-owner → not_authorised(42501); anon → blocked.
--   Then STOP for prod go-ahead.
-- ====================================================================
