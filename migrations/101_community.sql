-- 101_community.sql
-- ====================================================================
-- Community membership module (Session AZ). A new top-level "Community" section
-- in the mosque dashboard: Members · Visitor register (QR) · Groups.
--
-- NO membership fees anywhere. NO new role: account-linked members keep
-- profiles.role='user' (same convention as enrolled parents); membership is the
-- community_members row (mosque_id + optional profile_id link + status). The
-- 017 role CHECK and setProfileRole whitelist are untouched.
--
-- Five tables + two anon-safe SECURITY DEFINER RPCs for the public QR check-in
-- (no broad anon table access — the harvest-guard pattern from 076/093). Emails
-- (member invites) fire CLIENT-side via /api/send-transactional; Postgres has no
-- mailer here. AI insights reuse /api/admin-brief (new mode, no new function).
--
-- Ownership predicate for every owner policy: mosques.user_id = auth.uid().
-- ====================================================================

-- 1. Members -------------------------------------------------------------------
-- profile_id nullable: manually-added / invited-but-not-yet-signed-up members
-- have no account. Enrolled parents are surfaced read-only by the app via a
-- join (madrasah enrolments → profiles); they are NOT duplicated in here.
create table if not exists public.community_members (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  name        text not null,
  email       text,
  phone       text,
  address     text,
  photo_url   text,
  notes       text,                          -- admin notes
  status      text not null default 'active' check (status in ('active','inactive')),
  joined_at   date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists community_members_mosque_idx  on public.community_members(mosque_id, status);
create index if not exists community_members_profile_idx on public.community_members(profile_id);
-- One member row per linked account per mosque (partial: only when linked).
create unique index if not exists community_members_mosque_profile_uidx
  on public.community_members(mosque_id, profile_id) where profile_id is not null;

alter table public.community_members enable row level security;

drop policy if exists "Owner manage community members" on public.community_members;
create policy "Owner manage community members" on public.community_members
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Members can read their own record.
drop policy if exists "Member reads own record" on public.community_members;
create policy "Member reads own record" on public.community_members
  for select to authenticated
  using (profile_id = auth.uid());

-- 2. Groups --------------------------------------------------------------------
create table if not exists public.community_groups (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists community_groups_mosque_idx on public.community_groups(mosque_id);

alter table public.community_groups enable row level security;

drop policy if exists "Owner manage community groups" on public.community_groups;
create policy "Owner manage community groups" on public.community_groups
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- 3. Group membership (many-to-many) -------------------------------------------
create table if not exists public.community_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.community_groups(id) on delete cascade,
  member_id  uuid not null references public.community_members(id) on delete cascade,
  joined_at  date not null default current_date,
  unique (group_id, member_id)
);
create index if not exists community_group_members_group_idx  on public.community_group_members(group_id);
create index if not exists community_group_members_member_idx on public.community_group_members(member_id);

alter table public.community_group_members enable row level security;

-- Owner-scoped by joining the group → mosque.
drop policy if exists "Owner manage community group members" on public.community_group_members;
create policy "Owner manage community group members" on public.community_group_members
  for all to authenticated
  using (group_id in (
    select g.id from public.community_groups g
    join public.mosques m on m.id = g.mosque_id
    where m.user_id = auth.uid()))
  with check (group_id in (
    select g.id from public.community_groups g
    join public.mosques m on m.id = g.mosque_id
    where m.user_id = auth.uid()));

-- 4. Sessions (a check-in window: Jumu'ah, an event, …) -------------------------
create table if not exists public.community_sessions (
  id               uuid primary key default gen_random_uuid(),
  mosque_id        uuid not null references public.mosques(id) on delete cascade,
  name             text not null,                        -- e.g. "Jumu'ah"
  session_date     date not null default current_date,
  opened_at        timestamptz not null default now(),
  closes_at        timestamptz,                          -- configurable auto-close; null = no auto-close
  closed_at        timestamptz,                          -- null = still open
  manual_headcount integer not null default 0,           -- anonymous footfall added after close
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists community_sessions_mosque_idx on public.community_sessions(mosque_id, session_date desc);

alter table public.community_sessions enable row level security;

drop policy if exists "Owner manage community sessions" on public.community_sessions;
create policy "Owner manage community sessions" on public.community_sessions
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- 5. Attendance ----------------------------------------------------------------
-- member_id null  = anonymous visitor (name/phone captured on the QR form, or a
-- pure manual headcount lives on the session, not here). check_in_method: qr |
-- geofence | manual. is_first_time computed server-side in the RPC.
create table if not exists public.community_attendance (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.community_sessions(id) on delete cascade,
  member_id        uuid references public.community_members(id) on delete set null,
  name             text,                                 -- for anonymous / named-non-member
  phone            text,
  check_in_method  text not null check (check_in_method in ('qr','geofence','manual')),
  is_first_time    boolean not null default false,
  checked_in_at    timestamptz not null default now()
);
create index if not exists community_attendance_session_idx on public.community_attendance(session_id, checked_in_at);
create index if not exists community_attendance_member_idx  on public.community_attendance(member_id);
-- Dedup named check-ins: a member can't be double-counted (QR + geofence) in a
-- session. Partial so multiple anonymous (member_id null) rows are allowed.
create unique index if not exists community_attendance_session_member_uidx
  on public.community_attendance(session_id, member_id) where member_id is not null;

alter table public.community_attendance enable row level security;

-- Owner reads/manages attendance for their own sessions. Public check-in writes
-- go exclusively through the harvest-guarded RPC below (no anon INSERT policy).
drop policy if exists "Owner manage community attendance" on public.community_attendance;
create policy "Owner manage community attendance" on public.community_attendance
  for all to authenticated
  using (session_id in (
    select s.id from public.community_sessions s
    join public.mosques m on m.id = s.mosque_id
    where m.user_id = auth.uid()))
  with check (session_id in (
    select s.id from public.community_sessions s
    join public.mosques m on m.id = s.mosque_id
    where m.user_id = auth.uid()));

-- 6. Public session lookup (anon-safe) -----------------------------------------
-- The QR encodes /check-in?mosque=<id>&session=<id>. The landing page calls this
-- to show the session name/date + confirm it's open. Returns ONLY display fields
-- for the one session — no broad read on the table.
create or replace function public.community_session_public(p_session_id uuid)
returns table (name text, session_date date, mosque_name text, is_open boolean)
language sql
security definer
set search_path = public
as $$
  select s.name, s.session_date, m.name as mosque_name,
         (s.closed_at is null and (s.closes_at is null or now() < s.closes_at)) as is_open
  from public.community_sessions s
  join public.mosques m on m.id = s.mosque_id
  where s.id = p_session_id;
$$;
revoke all on function public.community_session_public(uuid) from public;
grant execute on function public.community_session_public(uuid) to anon, authenticated;

-- 7. Check in (anon-safe, harvest-guarded) -------------------------------------
-- One entry point for all three named/anon paths, distinguished by the CALLER'S
-- ROLE, not a client-supplied id:
--   * anonymous QR form  → anon role, auth.uid() null → member_id null, name/phone from form
--   * logged-in QR scan  → authenticated, member resolved from auth.uid()
--   * geofence auto      → authenticated, p_method 'geofence'
-- The member is resolved STRICTLY from auth.uid() (the caller's own JWT) — there
-- is no profile_id parameter, so an anon caller cannot forge a check-in as another
-- member. A member re-scanning (or geofence after QR) hits the partial unique index
-- and is silently deduped (already=true), not errored. is_first_time is computed
-- from prior attendance at this mosque (by member, else by phone).
--
-- Drop the earlier INSECURE 5-arg overload (…, p_profile_id, …) if present: a
-- create-or-replace with a different arg list adds a NEW overload rather than
-- replacing, so without this drop the client-trusting version would linger and
-- stay anon-callable. Idempotent — safe on first apply and on re-run.
drop function if exists public.community_check_in(uuid, uuid, text, text, text);

create or replace function public.community_check_in(
  p_session_id uuid,
  p_name       text,
  p_phone      text,
  p_method     text
) returns table (ok boolean, first_time boolean, already boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session   public.community_sessions;
  v_mosque_id uuid;
  v_uid       uuid := auth.uid();     -- the caller's own identity; null for anon
  v_member_id uuid;
  v_first     boolean := false;
  v_phone     text := nullif(trim(p_phone), '');
  v_new_id    uuid;
begin
  if p_method not in ('qr','geofence','manual') then
    raise exception 'invalid check-in method';
  end if;
  select * into v_session from public.community_sessions where id = p_session_id;
  if v_session is null then raise exception 'session not found'; end if;
  if v_session.closed_at is not null or (v_session.closes_at is not null and now() >= v_session.closes_at) then
    raise exception 'this session is closed';
  end if;
  v_mosque_id := v_session.mosque_id;

  -- Named check-in resolves the member from the caller's OWN identity only.
  if v_uid is not null then
    select id into v_member_id from public.community_members
      where mosque_id = v_mosque_id and profile_id = v_uid;
  end if;
  if p_method = 'geofence' and v_member_id is null then
    raise exception 'geofence check-in is for registered members only';
  end if;

  -- First-time? By member if known, else by phone at this mosque.
  if v_member_id is not null then
    v_first := not exists (
      select 1 from public.community_attendance a
      join public.community_sessions s on s.id = a.session_id
      where s.mosque_id = v_mosque_id and a.member_id = v_member_id);
  elsif v_phone is not null then
    v_first := not exists (
      select 1 from public.community_attendance a
      join public.community_sessions s on s.id = a.session_id
      where s.mosque_id = v_mosque_id and a.phone = v_phone);
  end if;

  insert into public.community_attendance (session_id, member_id, name, phone, check_in_method, is_first_time)
  values (p_session_id, v_member_id, nullif(trim(p_name), ''), v_phone, p_method, v_first)
  on conflict (session_id, member_id) where member_id is not null do nothing
  returning id into v_new_id;

  if v_new_id is null and v_member_id is not null then
    -- Already checked in this session (dedup) — a no-op success, not an error.
    return query select true, false, true;
  else
    return query select true, v_first, false;
  end if;
end;
$$;
revoke all on function public.community_check_in(uuid,text,text,text) from public;
grant execute on function public.community_check_in(uuid,text,text,text) to anon, authenticated;

-- 7b. Member self-service reads (authenticated, auth.uid()-scoped) --------------
-- The member-facing dashboard (UserDashboard → Community tab) needs each member's
-- OWN attendance + groups. Those live under owner-only RLS (attendance→sessions,
-- group_members→groups join owner tables), so rather than open self-read policies
-- across four tables these definer RPCs return only the caller's slice, resolved
-- from auth.uid(). Members can belong to more than one mosque, so results span
-- all of the caller's linked community_members rows. (Their membership rows
-- themselves come via the community_members self-read policy + PostgREST.)
create or replace function public.my_community_attendance()
returns table (
  attendance_id uuid, session_id uuid, session_name text, session_date date,
  mosque_id uuid, mosque_name text, check_in_method text, checked_in_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select a.id, s.id, s.name, s.session_date,
         m.id, m.name, a.check_in_method, a.checked_in_at
  from public.community_attendance a
  join public.community_sessions s on s.id = a.session_id
  join public.mosques m           on m.id = s.mosque_id
  where a.member_id in (
    select cm.id from public.community_members cm where cm.profile_id = auth.uid())
  order by a.checked_in_at desc;
$$;
revoke all on function public.my_community_attendance() from public, anon;
grant execute on function public.my_community_attendance() to authenticated;

create or replace function public.my_community_groups()
returns table (
  group_id uuid, group_name text, description text,
  mosque_id uuid, mosque_name text, joined_at date
)
language sql
security definer
set search_path = public
as $$
  select g.id, g.name, g.description, m.id, m.name, gm.joined_at
  from public.community_group_members gm
  join public.community_groups g on g.id = gm.group_id
  join public.mosques m          on m.id = g.mosque_id
  where gm.member_id in (
    select cm.id from public.community_members cm where cm.profile_id = auth.uid())
  order by gm.joined_at desc;
$$;
revoke all on function public.my_community_groups() from public, anon;
grant execute on function public.my_community_groups() to authenticated;

-- 8. Realtime for the live check-in feed ---------------------------------------
-- Owner subscribes to attendance INSERTs for their session ids (postgres_changes,
-- RLS-respecting). Add the table to the supabase_realtime publication once.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_attendance'
  ) then
    alter publication supabase_realtime add table public.community_attendance;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev amanah-dev / pbej first, probe RAW rows, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe (read the ROWS, don't trust the Success banner):
--      -- tables + columns
--      select table_name, count(*) from information_schema.columns
--        where table_name in ('community_members','community_groups',
--          'community_group_members','community_sessions','community_attendance')
--        group by table_name;                                            -- 5 rows
--      -- RLS on (relrowsecurity = t for all five)
--      select relname, relrowsecurity from pg_class
--        where relname in ('community_members','community_groups',
--          'community_group_members','community_sessions','community_attendance');
--      -- policies (one owner-ALL each; community_members also has member self-read)
--      select tablename, polname, cmd from pg_policies
--        where tablename like 'community_%' order by tablename;          -- 6 rows
--      -- functions security-definer (all four)
--      select proname, prosecdef from pg_proc
--        where proname in ('community_session_public','community_check_in',
--          'my_community_attendance','my_community_groups');                   -- 4 rows, all t
--      -- anon may call ONLY the two public QR RPCs
--      select has_function_privilege('anon','public.community_session_public(uuid)','execute');           -- t
--      select has_function_privilege('anon','public.community_check_in(uuid,text,text,text)','execute'); -- t
--      -- member self-service RPCs: authenticated yes, anon no
--      select has_function_privilege('anon','public.my_community_attendance()','execute');                -- f
--      select has_function_privilege('anon','public.my_community_groups()','execute');                    -- f
--      select has_function_privilege('authenticated','public.my_community_attendance()','execute');       -- t
--      select has_function_privilege('authenticated','public.my_community_groups()','execute');           -- t
--      -- realtime publication includes attendance
--      select 1 from pg_publication_tables where pubname='supabase_realtime'
--        and tablename='community_attendance';                            -- 1 row
--   3. Functional probe (as anon, against a real dev mosque):
--      -- create a session as the owner first (or insert one via service role), then:
--      select * from community_session_public('<session-uuid>');          -- name/date/mosque/is_open=t
--      select * from community_check_in('<session-uuid>', 'Walk-in', '07700900123', 'qr'); -- ok=t first_time=t
--      select * from community_check_in('<session-uuid>', 'Walk-in', '07700900123', 'qr'); -- new anon row; first_time=f (phone seen)
--      -- as anon: select * from community_members;                        -- denied / 0 rows (no anon policy)
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
