-- 081_madrasa_waitlist.sql
-- ====================================================================
-- Madrasa Phase 3A — class waiting list. When a class is full, a parent joins
-- the waitlist for their child; when a seat frees (withdrawal / declined / expired
-- offer) the app offers it to the next student in admin-controlled `position`
-- order via a `madrasa_waitlist_offer` email. The offer is live for 48h — expiry
-- is reaped LAZILY (inside make_next_offer + re-checked in accept), NO cron.
--
-- Shape follows the module: mosque_id denormalized + forced to match the class in
-- every WITH CHECK (068/073/077); cross-table RLS via the existing SECURITY
-- DEFINER helpers (madrasa_is_class_teacher 070); email-resolving RPCs are
-- service_role-only with EXECUTE revoked from anon+authenticated (the 076 lesson).
-- ====================================================================

-- --------------------------------------------------------------------
-- madrasa_waitlist
-- --------------------------------------------------------------------
create table if not exists public.madrasa_waitlist (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.madrasa_classes(id) on delete cascade,
  student_id       uuid not null references public.students(id)        on delete cascade,
  mosque_id        uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  position         integer not null default 0,   -- server-assigned (trigger); admins reorder via UPDATE
  status           text not null default 'waiting'
                     check (status in ('waiting','offered','enrolled','declined','expired','cancelled')),
  offered_at       timestamptz,
  offer_expires_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- One LIVE waitlist row per (class, student); terminal rows stay as history → re-join allowed.
create unique index if not exists madrasa_waitlist_live_uniq
  on public.madrasa_waitlist(class_id, student_id) where status in ('waiting','offered');
create index if not exists madrasa_waitlist_class_pos_idx on public.madrasa_waitlist(class_id, position);
create index if not exists madrasa_waitlist_mosque_idx    on public.madrasa_waitlist(mosque_id);
create index if not exists madrasa_waitlist_student_idx   on public.madrasa_waitlist(student_id);

alter table public.madrasa_waitlist enable row level security;

-- Owner (+admin): manage their mosque's waitlist; mosque_id forced to match class.
create policy "Owner manage waitlist"
  on public.madrasa_waitlist for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- Class teacher: read their class's waitlist (definer helper).
create policy "Teacher read class waitlist"
  on public.madrasa_waitlist for select to authenticated
  using (public.madrasa_is_class_teacher(class_id));

-- Parent: read own-child waitlist rows.
create policy "Parent read own-child waitlist"
  on public.madrasa_waitlist for select to authenticated
  using (student_id in (select id from public.students where profile_id = auth.uid()));

-- Parent: join the waitlist for their own child (status forced 'waiting',
-- mosque_id forced to match the active class — can't be spoofed). 068 shape.
create policy "Parent join waitlist own child"
  on public.madrasa_waitlist for insert to authenticated
  with check (
    student_id in (select id from public.students where profile_id = auth.uid())
    and class_id in (select id from public.madrasa_classes where status = 'active')
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
    and status = 'waiting'
  );

-- Parent: leave / decline own-child row only — cannot self-promote to offered/enrolled.
create policy "Parent update own-child waitlist"
  on public.madrasa_waitlist for update to authenticated
  using      (student_id in (select id from public.students where profile_id = auth.uid()))
  with check (
    student_id in (select id from public.students where profile_id = auth.uid())
    and status in ('waiting','cancelled','declined')
  );

-- --------------------------------------------------------------------
-- position: server-assigned on insert (append to end). Overrides any client
-- value so parents can't queue-jump; admins reorder afterward via UPDATE.
-- --------------------------------------------------------------------
create or replace function public.madrasa_waitlist_set_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(max(position), 0) + 1 into new.position
  from public.madrasa_waitlist
  where class_id = new.class_id and status in ('waiting','offered');
  return new;
end;
$$;

drop trigger if exists madrasa_waitlist_position_biu on public.madrasa_waitlist;
create trigger madrasa_waitlist_position_biu
  before insert on public.madrasa_waitlist
  for each row execute function public.madrasa_waitlist_set_position();

-- --------------------------------------------------------------------
-- make_next_offer: reap stale offers → if a seat is free, offer the next waiting
-- student (admin order, then FIFO) for 48h, and return the email payload resolved
-- server-side (parent email lives in profiles). Service-role ONLY (harvest guard).
-- --------------------------------------------------------------------
create or replace function public.madrasa_waitlist_make_next_offer(p_class uuid)
returns table (
  waitlist_id         uuid,
  student_id          uuid,
  student_name        text,
  parent_user_id      uuid,
  parent_email        text,
  parent_name         text,
  parent_email_opt_in boolean,
  class_name          text,
  mosque_id           uuid,
  mosque_name         text,
  offer_expires_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
-- RETURNS TABLE OUT-params (offer_expires_at, mosque_id, …) shadow same-named
-- table columns in plpgsql; resolve unqualified names to the COLUMN (033 lesson).
#variable_conflict use_column
declare
  v_capacity int;
  v_taken    int;
  v_next     uuid;
  v_expires  timestamptz;
begin
  -- 1. Reap stale offers (the "no cron" 48h expiry, on next action).
  update public.madrasa_waitlist mw
    set status = 'expired', updated_at = now()
    where mw.class_id = p_class and mw.status = 'offered' and mw.offer_expires_at < now();

  -- 2. Free seat? capacity null = unlimited; active enrolments + outstanding offers consume seats.
  select capacity into v_capacity from public.madrasa_classes where id = p_class;
  if v_capacity is not null then
    select
      (select count(*) from public.madrasa_enrollments where class_id = p_class and status = 'active')
      + (select count(*) from public.madrasa_waitlist  where class_id = p_class and status = 'offered')
      into v_taken;
    if v_taken >= v_capacity then
      return;  -- no free seat
    end if;
  end if;

  -- 3. Next waiting student (admin order, then FIFO); skip-locked for concurrent callers.
  select w.id into v_next
    from public.madrasa_waitlist w
    where w.class_id = p_class and w.status = 'waiting'
    order by w.position asc, w.created_at asc
    limit 1
    for update skip locked;
  if v_next is null then
    return;
  end if;

  -- 4. Make the 48h offer.
  v_expires := now() + interval '48 hours';
  update public.madrasa_waitlist
    set status = 'offered', offered_at = now(), offer_expires_at = v_expires, updated_at = now()
    where id = v_next;

  -- 5. Email payload (mirrors madrasa_absences_to_notify resolution).
  return query
    select w.id, w.student_id, s.name, s.profile_id, pp.email, pp.name,
           coalesce((pp.notifications->>'email')::boolean, true),
           c.name, c.mosque_id, m.name, w.offer_expires_at
    from public.madrasa_waitlist w
    join public.madrasa_classes c on c.id = w.class_id
    join public.mosques m on m.id = c.mosque_id
    left join public.students s  on s.id = w.student_id
    left join public.profiles pp on pp.id = s.profile_id
    where w.id = v_next;
end;
$$;

-- --------------------------------------------------------------------
-- accept: parent accepts a LIVE (unexpired) offer for their own child →
-- creates/reactivates the enrolment (068 reactivate pattern) + marks 'enrolled'.
-- Ownership + 48h freshness checked here (the "checked on next-enrol" guard).
-- --------------------------------------------------------------------
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

  -- Stale/absent offers are refused here; reaping is make_next_offer's job (an
  -- in-line UPDATE would just roll back with this RAISE in the same transaction).
  if w.status <> 'offered' or w.offer_expires_at is null or w.offer_expires_at < now() then
    raise exception 'offer is not open';
  end if;

  insert into public.madrasa_enrollments (class_id, student_id, mosque_id, status)
    values (w.class_id, w.student_id, w.mosque_id, 'active')
  on conflict (class_id, student_id) do update set status = 'active', enrolled_at = now()
  returning id into v_enrol;

  update public.madrasa_waitlist set status = 'enrolled', updated_at = now() where id = p_waitlist_id;
  return v_enrol;
end;
$$;

-- --------------------------------------------------------------------
-- Grants. make_next_offer resolves parent emails → service_role ONLY (076 lesson:
-- revoke from anon+authenticated explicitly, not just public). accept acts on the
-- caller's own student and is ownership-checked → authenticated may call it.
-- --------------------------------------------------------------------
revoke all     on function public.madrasa_waitlist_make_next_offer(uuid) from public;
revoke execute on function public.madrasa_waitlist_make_next_offer(uuid) from anon, authenticated;
grant  execute on function public.madrasa_waitlist_make_next_offer(uuid) to service_role;

revoke all     on function public.madrasa_waitlist_accept(uuid) from public;
revoke execute on function public.madrasa_waitlist_accept(uuid) from anon;
grant  execute on function public.madrasa_waitlist_accept(uuid) to authenticated, service_role;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_waitlist
--        select tablename, polname, cmd from pg_policies
--          where tablename = 'madrasa_waitlist' order by polname;
--        select proname, prosecdef from pg_proc
--          where proname in ('madrasa_waitlist_make_next_offer',
--                            'madrasa_waitlist_accept',
--                            'madrasa_waitlist_set_position');   -- prosecdef=t
--      As an authenticated (non-service) client:
--        rpc madrasa_waitlist_make_next_offer → permission denied (harvest guard).
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';
