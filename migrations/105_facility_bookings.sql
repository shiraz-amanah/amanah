-- 105_facility_bookings.sql
-- ====================================================================
-- Facility / hall booking module (Session BA). Two tables + a clash-proof
-- overlap constraint + two member-facing RPCs. Scoped to MEMBERS this session
-- (public/external requests are a later phase). Paid bookings are a placeholder
-- (Stripe later) — we snapshot a quoted_price for display only.
--
-- Naming: mosque_facilities (bookable SPACES) is distinct from mosques.facilities
-- (a text[] of amenities like 'parking'). Different object; no technical clash.
--
-- Dev first, probe, then prod.
-- ====================================================================

-- btree_gist gives us uuid equality inside a GiST index, needed by the no-overlap
-- EXCLUDE constraint below. Available on Supabase via create extension.
create extension if not exists btree_gist;

-- 1. Bookable facilities -------------------------------------------------------
create table if not exists public.mosque_facilities (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  name        text not null,
  description text,
  capacity    integer,
  hourly_rate numeric,                 -- null or 0 = free
  photo_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mosque_facilities_mosque_idx on public.mosque_facilities(mosque_id, active);

alter table public.mosque_facilities enable row level security;

drop policy if exists "Owner manage facilities" on public.mosque_facilities;
create policy "Owner manage facilities" on public.mosque_facilities
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Any authenticated user (a member) can read active facilities to request one.
-- (Public/anon read is a later phase; scoped to authenticated this session.)
drop policy if exists "Read active facilities" on public.mosque_facilities;
create policy "Read active facilities" on public.mosque_facilities
  for select to authenticated
  using (active = true);

-- 2. Bookings ------------------------------------------------------------------
-- requester_profile_id is the member (nullable, reserved for future public/anon
-- requests). requester_name/email/phone snapshot the requester for display +
-- email even if the account is later removed. quoted_price is informational
-- (hourly_rate × hours at request time) until Stripe lands.
create table if not exists public.mosque_bookings (
  id                   uuid primary key default gen_random_uuid(),
  mosque_id            uuid not null references public.mosques(id) on delete cascade,
  facility_id          uuid not null references public.mosque_facilities(id) on delete cascade,
  requester_profile_id uuid references public.profiles(id) on delete set null,
  requester_name       text not null,
  requester_email      text,
  requester_phone      text,
  purpose              text not null,     -- Nikah / Aqiqah / study circle / community event / private hire (free text)
  notes                text,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  attendees            integer,
  quoted_price         numeric,           -- snapshot; display only (Stripe later)
  status               text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  admin_note           text,              -- rejection reason / cancellation note
  reviewed_by          uuid references auth.users(id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint mosque_bookings_time_ck check (end_at > start_at)
);
create index if not exists mosque_bookings_mosque_idx    on public.mosque_bookings(mosque_id, start_at);
create index if not exists mosque_bookings_facility_idx  on public.mosque_bookings(facility_id, start_at);
create index if not exists mosque_bookings_requester_idx on public.mosque_bookings(requester_profile_id);

-- CLASH DETECTION: no two APPROVED bookings on the same facility may overlap.
-- Partial EXCLUDE — pending/rejected/cancelled rows are ignored, so multiple
-- pending requests for the same slot can coexist; approving one then blocks the
-- rest. tstzrange is [) so back-to-back bookings (14:00 end / 14:00 start) are OK.
alter table public.mosque_bookings drop constraint if exists mosque_bookings_no_overlap;
alter table public.mosque_bookings
  add constraint mosque_bookings_no_overlap
  exclude using gist (facility_id with =, tstzrange(start_at, end_at) with &&)
  where (status = 'approved');

alter table public.mosque_bookings enable row level security;

-- Owner: full CRUD on their mosque's bookings (approve/reject/cancel/see all).
drop policy if exists "Owner manage bookings" on public.mosque_bookings;
create policy "Owner manage bookings" on public.mosque_bookings
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Member: reads their OWN bookings. Writes go only through the RPCs below (so the
-- facility↔mosque link + requester identity + status can't be spoofed).
drop policy if exists "Member reads own booking" on public.mosque_bookings;
create policy "Member reads own booking" on public.mosque_bookings
  for select to authenticated
  using (requester_profile_id = auth.uid());

-- 3. Request a booking (member; definer so mosque_id is derived from the facility
--    and requester/status are pinned — no spoofing via a raw INSERT). -----------
create or replace function public.request_facility_booking(
  p_facility_id uuid, p_purpose text, p_notes text,
  p_start timestamptz, p_end timestamptz, p_attendees integer,
  p_name text, p_email text, p_phone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fac public.mosque_facilities;
  v_price numeric;
  v_id uuid;
begin
  if v_uid is null then raise exception 'sign in to request a booking'; end if;
  if coalesce(trim(p_purpose), '') = '' then raise exception 'a purpose is required'; end if;
  if p_end <= p_start then raise exception 'end time must be after the start time'; end if;
  if p_start < now() then raise exception 'choose a start time in the future'; end if;

  select * into v_fac from public.mosque_facilities where id = p_facility_id and active = true;
  if v_fac is null then raise exception 'facility not found'; end if;

  v_price := case when v_fac.hourly_rate is not null
    then round(v_fac.hourly_rate * (extract(epoch from (p_end - p_start)) / 3600.0), 2) else null end;

  insert into public.mosque_bookings (
    mosque_id, facility_id, requester_profile_id, requester_name, requester_email,
    requester_phone, purpose, notes, start_at, end_at, attendees, quoted_price, status
  ) values (
    v_fac.mosque_id, p_facility_id, v_uid, coalesce(nullif(trim(p_name), ''), 'Member'),
    nullif(trim(p_email), ''), nullif(trim(p_phone), ''), trim(p_purpose), nullif(trim(p_notes), ''),
    p_start, p_end, p_attendees, v_price, 'pending'
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_facility_booking(uuid,text,text,timestamptz,timestamptz,integer,text,text,text) from public, anon;
grant execute on function public.request_facility_booking(uuid,text,text,timestamptz,timestamptz,integer,text,text,text) to authenticated;

-- 4. Cancel a booking (the requester OR the mosque owner). --------------------
create or replace function public.cancel_facility_booking(p_id uuid, p_note text default null)
returns public.mosque_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.mosque_bookings;
begin
  if v_uid is null then raise exception 'sign in'; end if;
  select * into v_row from public.mosque_bookings where id = p_id;
  if v_row is null then raise exception 'booking not found'; end if;
  if v_row.requester_profile_id <> v_uid
     and v_row.mosque_id not in (select id from public.mosques where user_id = v_uid) then
    raise exception 'not authorised to cancel this booking';
  end if;
  update public.mosque_bookings
     set status = 'cancelled', admin_note = coalesce(nullif(trim(p_note), ''), admin_note), updated_at = now()
   where id = p_id returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.cancel_facility_booking(uuid,text) from public, anon;
grant execute on function public.cancel_facility_booking(uuid,text) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev pbej first, probe RAW rows, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe:
--      select extname from pg_extension where extname='btree_gist';                    -- 1 row
--      select relname, relrowsecurity from pg_class
--        where relname in ('mosque_facilities','mosque_bookings');                      -- both t
--      select tablename, polname, cmd from pg_policies
--        where tablename in ('mosque_facilities','mosque_bookings') order by tablename; -- 4 rows
--      select conname from pg_constraint where conname='mosque_bookings_no_overlap';    -- 1 row
--      select proname, prosecdef from pg_proc
--        where proname in ('request_facility_booking','cancel_facility_booking');       -- 2 rows, both t
--      select has_function_privilege('anon','public.request_facility_booking(uuid,text,text,timestamptz,timestamptz,integer,text,text,text)','execute'); -- f
--   3. Functional (as a member, against a real active facility):
--      select request_facility_booking('<facility>','Nikah',null, now()+interval '2 days',
--        now()+interval '2 days 3 hours', 80, 'Test', 'a@b.com', ''); -- returns a uuid, status pending
--      -- owner approves two overlapping bookings on the same facility → 2nd raises
--      --   'conflicting key value violates exclusion constraint "mosque_bookings_no_overlap"'.
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
