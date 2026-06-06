-- 083_madrasa_rewards.sql
-- ====================================================================
-- Madrasa Phase 3B — behaviour + rewards. A teacher/admin awards a student a
-- star/merit/achievement (positive) or logs a warning/concern (private). Parents
-- see their own child's rewards; positive awards email the parent.
--
-- ALSO folds in the Phase 3E export RPC (madrasa_export_roster) — the GDPR/bulk
-- export needs parent contact, which lives in `profiles` and a mosque OWNER can't
-- read via RLS; resolving it server-side needs a definer RPC, so it ships here
-- (one apply-gate) rather than a separate 3E migration.
--
-- Shape mirrors 077: mosque_id denormalized + forced to match the class in every
-- WITH CHECK; teacher cross-table check via the existing SECURITY DEFINER helper
-- madrasa_is_class_teacher (070 — no new helper); parent-own-child via a direct
-- students subquery (the 077 precedent — one-directional, no recursion, so the
-- 068/069 cyclic-re-entry lesson doesn't require a helper here). Email/contact
-- RPCs are definer + harvest-guarded (the 076 revoke-from-anon+authenticated).
-- ====================================================================

-- --------------------------------------------------------------------
-- madrasa_rewards
-- --------------------------------------------------------------------
create table if not exists public.madrasa_rewards (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.madrasa_classes(id) on delete cascade,
  student_id  uuid not null references public.students(id)        on delete cascade,
  mosque_id   uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  type        text not null check (type in ('star','merit','achievement','warning','concern')),
  note        text,
  awarded_by  uuid references public.profiles(id) on delete set null,
  awarded_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists madrasa_rewards_class_idx   on public.madrasa_rewards(class_id, awarded_at desc);
create index if not exists madrasa_rewards_student_idx  on public.madrasa_rewards(student_id);
create index if not exists madrasa_rewards_mosque_idx   on public.madrasa_rewards(mosque_id);

alter table public.madrasa_rewards enable row level security;

-- Owner (+admin): manage their mosque's rewards; mosque_id forced to match class.
create policy "Owner manage rewards"
  on public.madrasa_rewards for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- Class teacher: manage rewards for their classes (definer helper, 070).
create policy "Teacher manage class rewards"
  on public.madrasa_rewards for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (
    public.madrasa_is_class_teacher(class_id)
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- Parent: read own child's rewards — ALL types (warning/concern included; the UI
-- softens the label). No anon/public policy anywhere → rewards are never public.
create policy "Parent read own-child rewards"
  on public.madrasa_rewards for select to authenticated
  using (student_id in (select id from public.students where profile_id = auth.uid()));

-- --------------------------------------------------------------------
-- Reward email payload (positive types ONLY). Service-role-only: resolves the
-- parent email (lives in profiles) server-side for the madrasa_reward_awarded
-- intent. warning/concern return NO row here (defense-in-depth — never emailed).
-- --------------------------------------------------------------------
create or replace function public.madrasa_reward_email_data(p_reward uuid)
returns table (
  reward_id           uuid,
  type                text,
  note                text,
  student_name        text,
  parent_user_id      uuid,
  parent_email        text,
  parent_name         text,
  parent_email_opt_in boolean,
  class_name          text,
  mosque_id           uuid,
  mosque_name         text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.type, r.note, s.name, s.profile_id, pp.email, pp.name,
         coalesce((pp.notifications->>'email')::boolean, true),
         c.name, c.mosque_id, m.name
  from public.madrasa_rewards r
  join public.madrasa_classes c on c.id = r.class_id
  join public.mosques m on m.id = c.mosque_id
  left join public.students s  on s.id = r.student_id
  left join public.profiles pp on pp.id = s.profile_id
  where r.id = p_reward
    and r.type in ('star','merit','achievement');
$$;

-- --------------------------------------------------------------------
-- Phase 3E export — per active enrolment for a mosque: student + parent contact
-- (profiles) + attendance totals. Authz is INSIDE the query (caller owns the
-- mosque or is platform admin) → a teacher or other authed user gets 0 rows, so
-- it's safe to grant to `authenticated` (the authz, not the grant, is the gate).
-- The single-student GDPR export filters this client-side for contact+summary and
-- reads per-session detail via existing owner RLS.
-- --------------------------------------------------------------------
create or replace function public.madrasa_export_roster(p_mosque uuid)
returns table (
  student_id    uuid,
  student_name  text,
  age           int,
  relation      text,
  parent_name   text,
  parent_email  text,
  parent_phone  text,
  class_id      uuid,
  class_name    text,
  present       int,
  absent        int,
  late          int,
  excused       int
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.age, s.relation, pp.name, pp.email, pp.phone, c.id, c.name,
         count(*) filter (where a.status = 'present')::int,
         count(*) filter (where a.status = 'absent')::int,
         count(*) filter (where a.status = 'late')::int,
         count(*) filter (where a.status = 'excused')::int
  from public.madrasa_enrollments e
  join public.madrasa_classes c on c.id = e.class_id
  left join public.students s  on s.id = e.student_id
  left join public.profiles pp on pp.id = s.profile_id
  left join public.madrasa_attendance a on a.student_id = e.student_id and a.class_id = e.class_id
  where e.mosque_id = p_mosque
    and e.status = 'active'
    and (p_mosque in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  group by s.id, s.name, s.age, s.relation, pp.name, pp.email, pp.phone, c.id, c.name;
$$;

-- --------------------------------------------------------------------
-- Grants. reward_email_data resolves arbitrary parents' emails (no in-query
-- authz) → service_role ONLY (076: revoke from anon + authenticated explicitly).
-- export_roster gates on mosque ownership in the query → authenticated may call.
-- --------------------------------------------------------------------
revoke all     on function public.madrasa_reward_email_data(uuid) from public;
revoke execute on function public.madrasa_reward_email_data(uuid) from anon, authenticated;
grant  execute on function public.madrasa_reward_email_data(uuid) to service_role;

revoke all     on function public.madrasa_export_roster(uuid) from public;
revoke execute on function public.madrasa_export_roster(uuid) from anon;
grant  execute on function public.madrasa_export_roster(uuid) to authenticated, service_role;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_rewards
--        select tablename, polname, cmd from pg_policies
--          where tablename = 'madrasa_rewards' order by polname;        -- 3 rows
--        select proname, prosecdef from pg_proc
--          where proname in ('madrasa_reward_email_data','madrasa_export_roster'); -- prosecdef=t
--        -- harvest guard: reward_email_data = service_role only; export_roster = authed+service.
--        select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_exec
--          from pg_proc p, (values ('anon'),('authenticated'),('service_role')) r(rolname)
--          where p.proname in ('madrasa_reward_email_data','madrasa_export_roster')
--          order by p.proname, r.rolname;
--      As anon: select from madrasa_rewards → 0 rows / denied.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';
