-- 111_madrasa_fees.sql
-- ====================================================================
-- Madrasah fees — RECORD-KEEPING ONLY (no Stripe yet). Two tables + three RPCs.
--
--   madrasa_fees          one fee definition per (class, term): type, amount, due
--   madrasa_fee_records   one row per enrolled student per fee: due/paid/status
--
-- Design follows the module (068/070/081): mosque_id denormalized + forced to
-- match the parent in every WITH CHECK; owner-only CRUD (no parent/member access —
-- fees are admin-only for now); cross-table reads via SECURITY DEFINER RPCs where
-- RLS would otherwise block (parent contact lives in profiles, which owners can't
-- read directly — the 081 make_next_offer lesson).
--
-- STATUS NOTE: madrasa_fee_records.status stores paid/partial/outstanding/waived.
-- 'overdue' is in the CHECK for forward-compat but is NOT written here — it is
-- time-dependent (outstanding AND past due_date + grace_period_days) and is derived
-- in the UI at render time, so no cron is needed to flip rows.
--
-- Also in this migration (waiting-list console work, Change 2):
--   get_mosque_waitlist(mosque)            owner-authed cross-class waitlist + parent contact
--   madrasa_waitlist_offer_specific(row)   service-role: offer a seat to a SPECIFIC waiting row
--                                          (make_next_offer only ever offers the head of the queue)
-- ====================================================================

-- --------------------------------------------------------------------
-- madrasa_fees — per-class, per-term fee definition
-- --------------------------------------------------------------------
create table if not exists public.madrasa_fees (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null references public.madrasa_classes(id) on delete cascade,
  mosque_id         uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  fee_type          text not null default 'per_term'
                      check (fee_type in ('free','per_term','per_month','per_session')),
  amount            numeric(10,2) not null default 0,
  currency          text not null default 'GBP',
  term_label        text,                        -- e.g. "Autumn 2026"
  due_date          date,
  grace_period_days int not null default 7,
  created_at        timestamptz not null default now()
);
create index if not exists madrasa_fees_class_idx  on public.madrasa_fees(class_id);
create index if not exists madrasa_fees_mosque_idx on public.madrasa_fees(mosque_id);

-- --------------------------------------------------------------------
-- madrasa_fee_records — one per (fee, student)
-- --------------------------------------------------------------------
create table if not exists public.madrasa_fee_records (
  id          uuid primary key default gen_random_uuid(),
  fee_id      uuid not null references public.madrasa_fees(id) on delete cascade,
  student_id  uuid not null references public.students(id)     on delete cascade,
  mosque_id   uuid not null references public.mosques(id)      on delete cascade,  -- denormalized for RLS
  amount_due  numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  status      text not null default 'outstanding'
                check (status in ('paid','partial','outstanding','overdue','waived')),
  paid_at     timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (fee_id, student_id)
);
create index if not exists madrasa_fee_records_fee_idx     on public.madrasa_fee_records(fee_id);
create index if not exists madrasa_fee_records_student_idx on public.madrasa_fee_records(student_id);
create index if not exists madrasa_fee_records_mosque_idx  on public.madrasa_fee_records(mosque_id);

alter table public.madrasa_fees        enable row level security;
alter table public.madrasa_fee_records enable row level security;

-- --------------------------------------------------------------------
-- RLS — owner (+admin) full CRUD; mosque_id forced to match the parent row.
-- No parent/member/teacher policies: fees are admin-only for now.
-- --------------------------------------------------------------------
drop policy if exists "Owner manage fees" on public.madrasa_fees;
create policy "Owner manage fees"
  on public.madrasa_fees for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

drop policy if exists "Owner manage fee records" on public.madrasa_fee_records;
create policy "Owner manage fee records"
  on public.madrasa_fee_records for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_fees where id = fee_id)
  );

-- --------------------------------------------------------------------
-- madrasa_fee_create_with_records: create a fee AND auto-generate one record per
-- ACTIVE enrolment in the class. Owner-checked definer (records insert bypasses
-- the per-row RLS in one atomic call). amount = 0 → records start 'paid'.
-- --------------------------------------------------------------------
create or replace function public.madrasa_fee_create_with_records(
  p_class      uuid,
  p_fee_type   text,
  p_amount     numeric,
  p_currency   text,
  p_term_label text,
  p_due_date   date,
  p_grace      int
) returns public.madrasa_fees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mosque uuid;
  v_fee    public.madrasa_fees;
begin
  select mosque_id into v_mosque from public.madrasa_classes where id = p_class;
  if v_mosque is null then raise exception 'class not found'; end if;
  if not exists (select 1 from public.mosques m where m.id = v_mosque and m.user_id = auth.uid())
     and not public.is_admin() then
    raise exception 'not authorised for this mosque';
  end if;

  insert into public.madrasa_fees(class_id, mosque_id, fee_type, amount, currency, term_label, due_date, grace_period_days)
    values (p_class, v_mosque, coalesce(nullif(trim(p_fee_type), ''), 'per_term'),
            coalesce(p_amount, 0), coalesce(nullif(trim(p_currency), ''), 'GBP'),
            nullif(trim(p_term_label), ''), p_due_date, coalesce(p_grace, 7))
    returning * into v_fee;

  insert into public.madrasa_fee_records(fee_id, student_id, mosque_id, amount_due, status)
    select v_fee.id, e.student_id, v_mosque, v_fee.amount,
           case when v_fee.amount = 0 then 'paid' else 'outstanding' end
    from public.madrasa_enrollments e
    where e.class_id = p_class and e.status = 'active';

  return v_fee;
end;
$$;

revoke all     on function public.madrasa_fee_create_with_records(uuid,text,numeric,text,text,date,int) from public, anon;
grant  execute on function public.madrasa_fee_create_with_records(uuid,text,numeric,text,text,date,int) to authenticated;

-- --------------------------------------------------------------------
-- get_mosque_waitlist: owner-authed cross-class waiting-list console. Returns all
-- LIVE (waiting/offered) rows for the mosque, joined to class name + student name +
-- parent contact. Parent name/email live in profiles (owners can't read via RLS —
-- 081 lesson), so they are resolved here; parent phone is the student's emergency
-- contact. Owner/admin-checked; authenticated may call it.
-- --------------------------------------------------------------------
create or replace function public.get_mosque_waitlist(p_mosque uuid)
returns table (
  waitlist_id      uuid,
  class_id         uuid,
  class_name       text,
  student_id       uuid,
  student_name     text,
  queue_position   integer,   -- 'position' is a reserved word → cannot be an OUT-param name
  status           text,
  created_at       timestamptz,
  offer_expires_at timestamptz,
  parent_user_id   uuid,
  parent_name      text,
  parent_email     text,
  parent_phone     text
)
language plpgsql
security definer
set search_path = public
as $$
-- OUT params (class_id, status, queue_position, created_at…) shadow same-named
-- columns; every column below is table-qualified, so use_column resolves cleanly (081).
#variable_conflict use_column
begin
  if not exists (select 1 from public.mosques m where m.id = p_mosque and m.user_id = auth.uid())
     and not public.is_admin() then
    raise exception 'not authorised for this mosque';
  end if;

  return query
    select w.id, w.class_id, c.name, w.student_id, s.name, w.position, w.status,
           w.created_at, w.offer_expires_at,
           s.profile_id, pp.name, pp.email, s.emergency_contact_phone
    from public.madrasa_waitlist w
    join public.madrasa_classes c on c.id = w.class_id
    left join public.students s  on s.id = w.student_id
    left join public.profiles pp on pp.id = s.profile_id
    where w.mosque_id = p_mosque and w.status in ('waiting', 'offered')
    order by c.name asc, w.position asc, w.created_at asc;
end;
$$;

revoke all     on function public.get_mosque_waitlist(uuid) from public, anon;
grant  execute on function public.get_mosque_waitlist(uuid) to authenticated;

-- --------------------------------------------------------------------
-- madrasa_waitlist_offer_specific: offer a seat to ONE named waiting row (admins
-- may skip the queue — the head may have moved away, etc.). Mirrors
-- make_next_offer's reap + seat-gate + 48h offer + server-resolved email payload,
-- but targets p_waitlist_id instead of the head of the queue. Service-role ONLY
-- (resolves parent email → harvest guard, exactly like make_next_offer). The
-- send-transactional intent verifies the caller owns the mosque before invoking it.
-- --------------------------------------------------------------------
create or replace function public.madrasa_waitlist_offer_specific(p_waitlist_id uuid)
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
#variable_conflict use_column
declare
  v_class    uuid;
  v_status   text;
  v_capacity int;
  v_taken    int;
  v_expires  timestamptz;
begin
  -- 1. Resolve + lock the target row (skip if another caller holds it).
  select class_id, status into v_class, v_status
    from public.madrasa_waitlist
    where id = p_waitlist_id
    for update skip locked;
  if v_class is null then return; end if;

  -- 2. Reap stale offers for this class (the "no cron" 48h expiry, on next action).
  update public.madrasa_waitlist mw
    set status = 'expired', updated_at = now()
    where mw.class_id = v_class and mw.status = 'offered' and mw.offer_expires_at < now();

  -- 3. Only a still-waiting row can be offered.
  if v_status <> 'waiting' then return; end if;

  -- 4. Free seat? capacity null = unlimited; active enrolments + outstanding offers consume seats.
  select capacity into v_capacity from public.madrasa_classes where id = v_class;
  if v_capacity is not null then
    select
      (select count(*) from public.madrasa_enrollments where class_id = v_class and status = 'active')
      + (select count(*) from public.madrasa_waitlist  where class_id = v_class and status = 'offered')
      into v_taken;
    if v_taken >= v_capacity then
      return;  -- no free seat
    end if;
  end if;

  -- 5. Make the 48h offer on the specific row.
  v_expires := now() + interval '48 hours';
  update public.madrasa_waitlist
    set status = 'offered', offered_at = now(), offer_expires_at = v_expires, updated_at = now()
    where id = p_waitlist_id;

  -- 6. Email payload (identical shape to make_next_offer).
  return query
    select w.id, w.student_id, s.name, s.profile_id, pp.email, pp.name,
           coalesce((pp.notifications->>'email')::boolean, true),
           c.name, c.mosque_id, m.name, w.offer_expires_at
    from public.madrasa_waitlist w
    join public.madrasa_classes c on c.id = w.class_id
    join public.mosques m on m.id = c.mosque_id
    left join public.students s  on s.id = w.student_id
    left join public.profiles pp on pp.id = s.profile_id
    where w.id = p_waitlist_id;
end;
$$;

revoke all     on function public.madrasa_waitlist_offer_specific(uuid) from public;
revoke execute on function public.madrasa_waitlist_offer_specific(uuid) from anon, authenticated;
grant  execute on function public.madrasa_waitlist_offer_specific(uuid) to service_role;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows, not the Success banner):
--        -- tables + columns
--        select table_name, column_name from information_schema.columns
--          where table_name in ('madrasa_fees','madrasa_fee_records') order by table_name, ordinal_position;
--        -- RLS policies (2 expected, both cmd = ALL)
--        select tablename, polname, cmd from pg_policies
--          where tablename in ('madrasa_fees','madrasa_fee_records') order by tablename, polname;
--        -- functions are SECURITY DEFINER (prosecdef = t)
--        select proname, prosecdef from pg_proc
--          where proname in ('madrasa_fee_create_with_records','get_mosque_waitlist','madrasa_waitlist_offer_specific');
--        -- grant matrix
--        select has_function_privilege('anon',
--          'public.get_mosque_waitlist(uuid)','execute');                       -- f
--        select has_function_privilege('authenticated',
--          'public.get_mosque_waitlist(uuid)','execute');                       -- t
--        select has_function_privilege('authenticated',
--          'public.madrasa_waitlist_offer_specific(uuid)','execute');           -- f (service-role only)
--        select has_function_privilege('service_role',
--          'public.madrasa_waitlist_offer_specific(uuid)','execute');           -- t
--        select has_function_privilege('authenticated',
--          'public.madrasa_fee_create_with_records(uuid,text,numeric,text,text,date,int)','execute');  -- t
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
