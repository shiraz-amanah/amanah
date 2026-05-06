-- STATUS: Verbatim
-- Already applied: 7 May 2026 (NOTES.md Session J).
--
-- Replaces Session I's manual SQL claim with a real onboarding pipeline:
-- scholar signs up → fills 5-step wizard → submits to scholar_applications
-- → admin reviews + approves in admin panel → trigger creates the
-- scholars row with status='pending_verification' → admin manually flips
-- the verification flags + scholars.status='active' later (separate
-- session).
--
-- ADMIN GATE — TRUST BOUNDARY: there is no DB-level admin role today.
-- Existing AdminPanel access is purely client-side (role==="admin" in
-- React state, set by the legacy LoginScreen which accepts any
-- credentials). Per Session J brief decision (a):
--   - SELECT is open to any authenticated user (privacy concern: any
--     authed user can read other users' wizard submissions including
--     bio, qualifications, city)
--   - UPDATE is open to any authenticated user (integrity concern:
--     any authed user can flip status to approved/rejected)
-- This matches the existing AdminPanel pattern (mosque queue, scholar
-- queue, flag moderation are all client-side gated already). Real
-- admin RLS is its own future session.
--
-- VERIFIED FLAGS — there is no single `verified` column on scholars.
-- Three separate flags exist: dbs_verified, rtw_verified,
-- ijazah_verified. The UI's "verified" badge ANDs them together. New
-- scholars start with all three false (column defaults).
--
-- PUBLIC VISIBILITY — getScholars / getScholarsByCategory filter on
-- scholars.status = 'active'. New scholars created by the approval
-- trigger get status='pending_verification' to hide them from public
-- listings until DBS / RTW / ijazah are manually verified by admin
-- and status flipped to 'active'.

create table scholar_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  -- Step 2: about
  full_name text not null,
  city text not null,
  languages text[] not null default '{}',
  avatar_url text,
  -- Step 3: qualifications
  ijazah_summary text,
  formal_education text,
  years_teaching integer,
  dbs_status text check (dbs_status in ('enhanced', 'basic', 'none', 'in_progress')),
  -- Step 4: services
  -- subjects holds CATEGORIES ids (e.g. 'quran-kids', 'arabic', 'fiqh')
  -- so it maps 1:1 onto scholars.categories on approval
  subjects text[] not null default '{}',
  packages jsonb not null default '[]',
  bio text not null,
  -- Approval metadata
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text,
  -- The scholars row created on approval
  created_scholar_id uuid references scholars(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- One pending application per user. After rejection, the user can
-- submit a new one (rejected rows are kept; the constraint only
-- applies to pending status).
create unique index idx_one_pending_app_per_user
  on scholar_applications (user_id)
  where status = 'pending';

create index scholar_applications_status_idx on scholar_applications(status);
create index scholar_applications_user_id_idx on scholar_applications(user_id);

alter table scholar_applications enable row level security;

-- Authenticated users can read all applications. Trust boundary is
-- the application — admin queue UI is gated client-side. Privacy
-- concern flagged in header.
create policy "Authenticated read all applications"
  on scholar_applications for select
  to authenticated
  using (true);

-- Authenticated users can insert their own application. The unique
-- index on (user_id) where status='pending' enforces one pending
-- application at a time.
create policy "Users insert own application"
  on scholar_applications for insert
  to authenticated
  with check (user_id = auth.uid());

-- Authenticated users can update applications. Trust boundary is
-- the application — admin queue does approve/reject, the wizard
-- can patch a pending app while it's still being filled. Integrity
-- concern flagged in header.
create policy "Authenticated update applications"
  on scholar_applications for update
  to authenticated
  using (true)
  with check (true);

-- Trigger: on UPDATE to approved, create scholars row with
-- status='pending_verification' and link back. On rejected, just
-- stamp reviewed_at.
create or replace function handle_application_approval()
returns trigger as $$
declare
  new_scholar_id uuid;
  base_slug text;
  candidate_slug text;
  collision_count int;
  suffix int := 0;
begin
  if NEW.status = 'approved' and OLD.status = 'pending' then
    -- Generate slug from full_name. Lowercase, replace runs of
    -- non-alphanumerics with hyphens, trim leading/trailing hyphens.
    base_slug := trim(both '-' from lower(regexp_replace(NEW.full_name, '[^a-zA-Z0-9]+', '-', 'g')));
    -- Edge case: empty result (e.g. full_name was all special chars)
    if base_slug = '' then
      base_slug := 'scholar';
    end if;
    candidate_slug := base_slug;

    -- Append -2, -3, … on collision
    loop
      select count(*) into collision_count from scholars where slug = candidate_slug;
      exit when collision_count = 0;
      suffix := suffix + 1;
      candidate_slug := base_slug || '-' || (suffix + 1)::text;
    end loop;

    insert into scholars (
      slug, name, city, bio, languages, categories,
      packages, user_id, status,
      dbs_verified, rtw_verified, ijazah_verified
    )
    values (
      candidate_slug, NEW.full_name, NEW.city, NEW.bio,
      NEW.languages, NEW.subjects, NEW.packages,
      NEW.user_id, 'pending_verification',
      false, false, false
    )
    returning id into new_scholar_id;

    NEW.created_scholar_id := new_scholar_id;
    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
    NEW.updated_at := now();
  elsif NEW.status = 'rejected' and OLD.status = 'pending' then
    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
    NEW.updated_at := now();
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger scholar_application_approval
  before update on scholar_applications
  for each row execute function handle_application_approval();
