-- 142_demo_requests.sql
-- ====================================================================
-- Session THEME-1 (Commit 2) — durable lead capture for the public
-- "Book a demo" form (LandingPageV2 → send-transactional intent
-- 'demo_request'). Until now that path did ZERO DB writes: it fired a
-- SINGLE email to the platform owner. If Resend bounced or the mail was
-- filtered, the lead was gone permanently. This table is the durable
-- record; the serverless handler writes here BEFORE it sends any email.
--
-- (142 is free: the previous 142 was confirmed a no-op this session and
-- its file was deleted.)
--
-- SECURITY POSTURE — anon INSERT only, NO anon SELECT:
--   * The form is unauthenticated, so the anon role must be able to INSERT
--     a lead. The WITH CHECK pins status to the default 'new' so an
--     anonymous caller cannot pre-set a lead to 'contacted'/'closed' to
--     bury it.
--   * Harvest guard: leads (names, emails, phone numbers) must never be
--     readable by anon. Default Supabase grants ALL on public tables to
--     anon; we strip them and re-grant INSERT only, so anon can never
--     SELECT/UPDATE/DELETE — belt-and-braces on top of the RLS policies.
--     Consistent with the other anon-callable paths (cf. 037 search_logs,
--     whose reads are admin-only; 076/132 lockdowns).
--   * Reads are admin-only (public.is_admin()); the serverless writer uses
--     the service_role key, which bypasses RLS and the grants above.
-- ====================================================================

create table if not exists public.demo_requests (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  mosque_name    text not null,
  email          text not null
                   check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone          text,
  preferred_time text,
  status         text not null default 'new'
                   check (status in ('new', 'contacted', 'scheduled', 'closed')),
  created_at     timestamptz not null default now()
);

create index if not exists demo_requests_created_idx on public.demo_requests(created_at desc);
create index if not exists demo_requests_status_idx  on public.demo_requests(status);

alter table public.demo_requests enable row level security;

-- Anon (public landing form) may submit a lead, and nothing else.
create policy "Anon can submit demo requests"
  on public.demo_requests for insert
  to anon
  with check (status = 'new');

-- Admins read every lead. Non-admin authenticated users get no rows.
create policy "Admins read demo requests"
  on public.demo_requests for select
  to authenticated
  using (public.is_admin());

-- Harvest guard: lock anon to INSERT only (default grants ALL → strip, re-grant).
revoke all on public.demo_requests from anon;
grant insert on public.demo_requests to anon;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe — read the definitions back from the LIVE DB (RAW, not this file):
--        select conname, pg_get_constraintdef(oid) from pg_constraint
--          where conrelid = 'public.demo_requests'::regclass order by conname;
--        select policyname, cmd, roles::text, qual, with_check
--          from pg_policies where tablename = 'demo_requests' order by policyname;
--        select grantee, privilege_type from information_schema.role_table_grants
--          where table_name = 'demo_requests' and grantee = 'anon';
--      Expect: status enum + email-format checks present; anon has INSERT only;
--      one anon INSERT policy (with_check: status = 'new') + one admin SELECT.
--   3. EXERCISE THE FORM through the UI (a probe proves the table EXISTS, not
--      that the INSERT RUNS) — submit Book-a-demo, confirm a row lands here.
--   4. NOTIFY pgrst, 'reload schema';  (already fired above)
-- ====================================================================
