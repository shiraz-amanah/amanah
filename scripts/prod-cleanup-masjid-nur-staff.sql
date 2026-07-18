-- ============================================================================
-- PROD DATA CLEANUP — Masjid Nur staff directory (Gate 0, session staff-editing-v1)
-- ============================================================================
-- Target:  PRODUCTION Supabase (zgoyvztooyxqkcftwylr). Run in the prod SQL editor.
-- Author:  surfaced by Claude Code for Shiraz to review, confirm, and run by hand.
-- Goal:    remove junk test rows from Masjid Nur's mosque_staff so the staff list
--          shows only genuine records and the compliance score becomes a true
--          baseline. Also: fix leaked-headline role values, and — IF the junk
--          removal clears the last invalid-email rows — VALIDATE the migration-134
--          email-format constraints.
--
-- SAFETY MODEL (why this is shaped the way it is):
--   * Everything that references mosque_staff(id) is ON DELETE CASCADE or SET NULL
--     (verified against migrations 058/060/062/063/068/085/086/129/130/131/133).
--     => Deleting a mosque_staff row is self-contained and SAFE. Its HR children
--        (employment, contracts, timesheets, documents, onboarding session, etc.)
--        cascade automatically; audit/compliance/teacher refs null out.
--   * The ONLY restrict/no-action blockers point AT profiles
--     (mosque_staff.profile_id RESTRICT, mosque_staff_invites.invited_by RESTRICT,
--      plus many NO-ACTION audit FKs: message sender/user, verified_by/approved_by,
--      mosque_employees.profile_id, onboarding invited_by/reviewed_by, ...).
--     => Deleting a profiles row is fraught. So the profile+auth.users purge is a
--        SEPARATE, OPTIONAL, transaction-guarded step (PART 3) — not required to
--        meet the stated goal. PART 2 (staff-row deletes) alone cleans the list.
--
-- ORDERING (from NOTES.md "GoTrue teardown order" + FK probes):
--   mosque_staff (+cascading children)  ->  profiles  ->  auth.users
--   profiles_id_fkey = NO ACTION (must delete profiles before auth.users)
--
-- HOW TO RUN: run PART 1 first (read-only). Paste its output back. We confirm the
-- exact delete list, fill the id arrays in PART 2/PART 3, then you run those.
-- Storage note: deleting mosque_staff rows does NOT delete their files in the
-- private staff-documents bucket (no storage FK). Junk test files are harmless
-- orphans; a storage sweep is out of scope here.
-- ============================================================================


-- ############################################################################
-- PART 1 — DISCOVERY (READ ONLY — run this whole part, paste every result set)
-- ############################################################################

-- 1.0  Resolve Masjid Nur. EXPECT EXACTLY ONE ROW. If >1, we pick the right id
--      before running any delete.
select id as mosque_id, name, status, created_at
from public.mosques
where name ilike '%masjid nur%'
order by created_at;

-- 1.1  Full staff directory for Masjid Nur — the candidate universe.
--      Read name/email/role/status/staff_type/archived/created_at + profile_id.
--      (Replace the subquery id if 1.0 returned more than one mosque.)
select s.id            as staff_id,
       s.name,
       s.email,
       s.role,
       s.status,
       s.staff_type,
       s.archived,
       s.created_at,
       s.profile_id
from public.mosque_staff s
where s.mosque_id = (select id from public.mosques
                     where name ilike '%masjid nur%'
                     order by created_at limit 1)
order by s.created_at;

-- 1.2  Leaked-headline role scan — any staff row (whole DB) whose role is NOT one
--      of the known vocabulary values OR is suspiciously long / sentence-like.
--      Catches Fatima Zahra + anything with the same pattern so they're fixed
--      together. Known vocab = data/mosqueTaxonomy.js MOSQUE_STAFF_ROLES + the
--      legacy AddStaffModal/free-text values actually seen in prod.
select s.id as staff_id, m.name as mosque, s.name, s.email, s.role,
       length(s.role) as role_len
from public.mosque_staff s
join public.mosques m on m.id = s.mosque_id
where s.role is null
   or length(s.role) > 30
   or s.role ~ '[.!?]'                       -- punctuation => likely a headline/sentence
   or s.role !~* '^(imam|assistant imam|qur.?an teacher|arabic teacher|admin|administrator|caretaker|youth worker|teacher|coordinator|receptionist|treasurer|volunteer|chair|secretary|other)$'
order by role_len desc nulls first;

-- 1.3  Email-format violators still present AFTER you imagine the junk removed —
--      these are what block the migration-134 VALIDATE. Run again after PART 2 to
--      confirm zero before running PART 4. (transposed rows hold a NAME in email.)
select 'mosque_staff' as tbl, s.id, s.name, s.email, m.name as mosque
from public.mosque_staff s
join public.mosques m on m.id = s.mosque_id
where s.email is not null
  and s.email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
union all
select 'mosque_staff_invites' as tbl, i.id, null, i.invitee_email, m.name
from public.mosque_staff_invites i
join public.mosques m on m.id = i.mosque_id
where i.invitee_email is not null
  and i.invitee_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';

-- 1.4  PER-PROFILE REFERENCE SCAN — for every candidate's profile_id, count rows
--      in EVERY table that FKs to profiles. A profile with references ONLY from
--      mosque_staff / mosque_staff_* is a clean "staff-only test account" and is
--      safe to fully purge (PART 3). A profile referenced by scholars / students /
--      messages / bookings / another mosque's staff / mosque_employees etc. has a
--      REAL non-staff identity — DELETE THE STAFF ROW ONLY, never the profile.
--      (This is the FK-reference scan pattern: catalog-driven, so it stays correct
--       even as new FK columns are added.)
do $$
declare
  cand uuid[];
  r record;
  n bigint;
begin
  select array_agg(profile_id)
    into cand
  from public.mosque_staff
  where mosque_id = (select id from public.mosques
                     where name ilike '%masjid nur%'
                     order by created_at limit 1);

  raise notice '--- Reference scan for % candidate profile(s) ---', coalesce(array_length(cand,1),0);
  for r in
    select c.conrelid::regclass::text as ref_table,
           a.attname                  as ref_col
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
    order by 1, 2
  loop
    execute format('select count(*) from %s where %I = any($1)', r.ref_table, r.ref_col)
      into n using cand;
    if n > 0 then
      raise notice 'REFS  %.% = %', r.ref_table, r.ref_col, n;
    end if;
  end loop;

  -- Identity flags: does each profile have a non-staff role anywhere?
  raise notice '--- Non-staff identity per profile ---';
  for r in
    select p.id,
           exists(select 1 from public.scholars  sc where sc.user_id = p.id) as is_scholar,
           exists(select 1 from public.students  st where st.profile_id = p.id) as is_parent,
           (select count(*) from public.mosque_staff ms where ms.profile_id = p.id) as staff_rows,
           exists(select 1 from public.mosque_employees me where me.profile_id = p.id) as is_employee,
           p.email, p.name
    from public.profiles p
    where p.id = any(cand)
  loop
    raise notice 'PROFILE % (% / %) scholar=% parent=% employee=% staff_rows=%',
      r.id, r.email, r.name, r.is_scholar, r.is_parent, r.is_employee, r.staff_rows;
  end loop;
end $$;

-- 1.5  mosque_staff_invites for Masjid Nur (invited_by RESTRICT can block a later
--      profile purge; invitee rows may also be junk to clear).
select i.id, i.invitee_email, i.status, i.invited_by, i.created_at
from public.mosque_staff_invites i
where i.mosque_id = (select id from public.mosques
                     where name ilike '%masjid nur%'
                     order by created_at limit 1)
order by i.created_at;


-- ############################################################################
-- PART 2 — STAFF-ROW CLEANUP  (split into 2a preview + 2b delete)
-- ############################################################################
-- Deletes ONLY mosque_staff rows (children cascade, audit/compliance/teacher refs
-- null out). Does NOT touch profiles or auth.users — sufficient to clean the list
-- and settle the score.
--
-- SUPABASE-EDITOR SAFETY: 2a is ONE read-only SELECT; 2b is ONE `do $$ … $$` block
-- (its inner semicolons live inside the dollar-quote, so the editor cannot split
-- it — the failure mode from the first attempt). Run 2a, paste its rows here for
-- approval, THEN run 2b.
--
-- Decisions encoded (identical in 2a and 2b so the preview == the delete):
--   * clearly junk: onboard-test3, Shizzle x2, Prod Smoke, hello staff, ibby,
--     Haji Ali (delivered@resend.dev), "shiraz" (naveed.hameed@sky.com),
--     Fairaz Ahmed (scholar-test6), the Unnamed row.
--   * real real (shiraz+8@…): staff row deleted.
--   * Shiraz Real (concept_shiz@hotmail.com): STAFF ROW ONLY — profile stays
--     (shared test-parent account; PART 3 skipped, so nothing touches it).
--   * Adil Khan / Ibraheem Ahmed / Nasar Hussain: deleted ONLY IF no non-staff
--     identity (scholar/parent/employee/other-mosque staff) — in-SQL guard.
--   * Fatima Zahra: NOT here — role already fixed via the Identity Edit dialog.
-- Match notes: shiraz+8 via 'shiraz+8@%', scholar-test6 via 'scholar-test6%',
--   Unnamed via empty/null name (exact literals weren't visible to me) — 2a's
--   output is the review gate. A missed pattern under-deletes (safe, re-run);
--   mosque scope + explicit allowlist prevent any over-delete.

-- ----------------------------------------------------------------------------
-- 2a — PREVIEW (READ ONLY, single SELECT). Run this; paste the rows for approval.
--      `rows_to_delete` = how many this will remove; `staff_before` = the current
--      Masjid Nur total (expect 14). Deletes nothing.
-- ----------------------------------------------------------------------------
select
  case
    when s.email ilike 'shiraz+8@%'                  then 'real real (decision: delete staff row)'
    when lower(s.email) = 'concept_shiz@hotmail.com' then 'Shiraz Real (staff row only; profile stays)'
    when lower(s.email) = 'naveed.hameed@sky.com'    then 'shiraz'
    when lower(s.email) = 'delivered@resend.dev'     then 'Haji Ali'
    when s.email ilike 'scholar-test6%'              then 'Fairaz Ahmed'
    when lower(trim(s.name)) = 'fairaz ahmed'        then 'Fairaz Ahmed'
    when lower(trim(s.name)) in ('onboard-test3','shizzle','prod smoke','hello staff','ibby')
                                                     then 'junk: ' || s.name
    when coalesce(nullif(trim(s.name), ''), '') = '' then 'Unnamed row'
    else                                                  'plausible, no non-staff identity: ' || s.name
  end                                                                as why,
  s.name, s.email, s.role, s.status, s.staff_type, s.created_at,
  s.id                                                               as staff_id,
  count(*) over ()                                                   as rows_to_delete,
  (select count(*) from public.mosque_staff ms where ms.mosque_id = s.mosque_id) as staff_before
from public.mosque_staff s
where s.mosque_id = (select id from public.mosques where name ilike '%masjid nur%' order by created_at limit 1)
  and (
        -- (a) clearly-junk + resolved decision rows
        s.email ilike 'shiraz+8@%'
     or lower(s.email) in ('concept_shiz@hotmail.com', 'naveed.hameed@sky.com', 'delivered@resend.dev')
     or s.email ilike 'scholar-test6%'
     or lower(trim(s.name)) in ('fairaz ahmed', 'onboard-test3', 'shizzle', 'prod smoke', 'hello staff', 'ibby')
     or coalesce(nullif(trim(s.name), ''), '') = ''
        -- (b) plausible names, only if no non-staff identity exists anywhere
     or (
            lower(trim(s.name)) in ('adil khan', 'ibraheem ahmed', 'nasar hussain')
        and not exists (select 1 from public.scholars sc         where sc.user_id   = s.profile_id)
        and not exists (select 1 from public.students st         where st.profile_id = s.profile_id)
        and not exists (select 1 from public.mosque_employees me where me.profile_id = s.profile_id)
        and not exists (select 1 from public.mosque_staff o      where o.profile_id  = s.profile_id and o.id <> s.id)
        )
      )
order by why, s.name;

-- ----------------------------------------------------------------------------
-- 2b — DELETE (single `do $$ … $$` block — semicolon-split-proof). Run ONLY after
--      2a's list is approved. Prints each DELETED row + PRE/DELETED/POST counts as
--      NOTICEs (Supabase editor → "Messages" pane). Same predicate as 2a exactly.
-- ----------------------------------------------------------------------------
do $$
declare
  nur  uuid;
  pre  int;
  post int;
  ndel int := 0;
  r    record;
begin
  select id into nur
  from public.mosques
  where name ilike '%masjid nur%'
  order by created_at limit 1;

  if nur is null then
    raise exception 'Masjid Nur not found — aborting.';
  end if;

  select count(*) into pre from public.mosque_staff where mosque_id = nur;

  for r in
    delete from public.mosque_staff s
    where s.mosque_id = nur
      and (
            s.email ilike 'shiraz+8@%'
         or lower(s.email) in ('concept_shiz@hotmail.com', 'naveed.hameed@sky.com', 'delivered@resend.dev')
         or s.email ilike 'scholar-test6%'
         or lower(trim(s.name)) in ('fairaz ahmed', 'onboard-test3', 'shizzle', 'prod smoke', 'hello staff', 'ibby')
         or coalesce(nullif(trim(s.name), ''), '') = ''
         or (
                lower(trim(s.name)) in ('adil khan', 'ibraheem ahmed', 'nasar hussain')
            and not exists (select 1 from public.scholars sc         where sc.user_id   = s.profile_id)
            and not exists (select 1 from public.students st         where st.profile_id = s.profile_id)
            and not exists (select 1 from public.mosque_employees me where me.profile_id = s.profile_id)
            and not exists (select 1 from public.mosque_staff o      where o.profile_id  = s.profile_id and o.id <> s.id)
            )
          )
    returning s.id, s.name, s.email, s.role
  loop
    ndel := ndel + 1;
    raise notice 'DELETED  % | % | % | %', coalesce(r.name, '(unnamed)'), coalesce(r.email, '(no email)'), r.role, r.id;
  end loop;

  select count(*) into post from public.mosque_staff where mosque_id = nur;
  raise notice '--- PRE=%  DELETED=%  POST=%  (expect POST = PRE - DELETED) ---', pre, ndel, post;
end $$;


-- ############################################################################
-- PART 3 — OPTIONAL DEEP PURGE  (profiles + auth.users for PURE test accounts)
--          >>> SKIPPED THIS PASS (staff-editing-v1) per decision — DO NOT RUN. <<<
--          Left in the file for the record / a future purge pass. Only for
--          profile_ids shown as staff-only in 1.4 (no scholar/parent/employee/
--          message/booking identity). Transaction-guarded: any FK block rolls the
--          whole thing back and names the table — we handle it, never force it.
-- ############################################################################
-- NOTE: concept_shiz's profile is SHARED with the test-parent account — it MUST
-- NOT appear here. Only staff-only orphans belong in _purge_ids.

begin;

create temporary table _purge_ids (profile_id uuid) on commit drop;
insert into _purge_ids (profile_id) values
  ('00000000-0000-0000-0000-000000000000')      -- <placeholder — replace, or skip PART 3 entirely>
  on conflict do nothing;

do $$
begin
  if exists (select 1 from _purge_ids where profile_id = '00000000-0000-0000-0000-000000000000') then
    raise exception 'PLACEHOLDER id present — fill _purge_ids or skip PART 3.';
  end if;
end $$;

-- Guard: none of these may still have a mosque_staff row (would RESTRICT-block).
do $$
declare blk int;
begin
  select count(*) into blk
  from _purge_ids p
  join public.mosque_staff s on s.profile_id = p.profile_id;
  if blk > 0 then
    raise exception '% profile(s) still have a mosque_staff row — run PART 2 first.', blk;
  end if;
end $$;

-- Guard: refuse any profile with a non-staff identity (belt-and-braces).
do $$
declare bad int;
begin
  select count(*) into bad
  from _purge_ids p
  where exists(select 1 from public.scholars  sc where sc.user_id = p.profile_id)
     or exists(select 1 from public.students  st where st.profile_id = p.profile_id)
     or exists(select 1 from public.mosque_employees me where me.profile_id = p.profile_id);
  if bad > 0 then
    raise exception '% profile(s) have a real non-staff identity — remove from _purge_ids.', bad;
  end if;
end $$;

-- PRE counts.
select 'PRE  profiles'   as probe, count(*) n from public.profiles where id in (select profile_id from _purge_ids)
union all
select 'PRE  auth.users' as probe, count(*) n from auth.users     where id in (select profile_id from _purge_ids);

-- Clear invites authored by these profiles (invited_by RESTRICT) — junk invites only.
delete from public.mosque_staff_invites i
using _purge_ids p
where i.invited_by = p.profile_id;

-- profiles before auth.users (profiles_id_fkey = NO ACTION).
delete from public.profiles p using _purge_ids x where p.id = x.profile_id;
delete from auth.users    u using _purge_ids x where u.id = x.profile_id;

-- POST counts (expect 0 / 0).
select 'POST profiles'   as probe, count(*) n from public.profiles where id in (select profile_id from _purge_ids)
union all
select 'POST auth.users' as probe, count(*) n from auth.users     where id in (select profile_id from _purge_ids);

commit;
-- else on any FK error: rollback; (and paste the error — it names the blocking table)


-- ############################################################################
-- PART 4 — VALIDATE migration-134 email-format constraints  (RBAC-D unblock)
-- ############################################################################
-- ONLY run after PART 1.3 (re-run it) returns ZERO rows on prod. VALIDATE scans
-- existing rows and fails loudly if any invalid email remains — that's the intended
-- guard, not a bug. Also run these on DEV (dev may carry its own junk rows).

alter table public.mosque_staff
  validate constraint mosque_staff_email_format;

alter table public.mosque_staff_invites
  validate constraint mosque_staff_invites_invitee_email_format;

-- Probe — expect both convalidated = true.
select conname, convalidated
from pg_constraint
where conname in ('mosque_staff_email_format',
                  'mosque_staff_invites_invitee_email_format');
