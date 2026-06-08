-- 095_admin_notifications.sql
-- ====================================================================
-- Feed the admin notification bell (Session AS item 1). The 087 notifications
-- table already powers the bell for every other role; this adds ADMIN-targeted
-- rows for new scholar applications, mosque applications, mosque claims, flags
-- and DBS orders.
--
-- Two parts:
--   1. Widen the notifications.type CHECK to allow the new admin types.
--   2. A notify_admins() fan-out helper + AFTER INSERT triggers on the five
--      source tables. Each inserts one notification per admin (profiles.role =
--      'admin'). SECURITY DEFINER so the trigger can write rows for users other
--      than the actor (a scholar/anon submitting an application/claim).
-- ====================================================================

-- 1. Allow the admin notification types -------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'homework', 'report', 'attendance', 'reward', 'cover_request', 'message', 'system',
    'scholar_application', 'mosque_application', 'mosque_claim', 'flag', 'dbs_order'
  ));

-- 2. Fan-out helper: one notification per platform admin --------------------
create or replace function public.notify_admins(p_type text, p_title text, p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  select p.id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb)
  from public.profiles p
  where p.role = 'admin';
end;
$$;

-- 3. Triggers on the five source tables -------------------------------------
create or replace function public.notify_admin_scholar_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('scholar_application', 'New scholar application',
    coalesce(NEW.full_name, 'A scholar') || ' applied to join Amanah',
    jsonb_build_object('application_id', NEW.id));
  return NEW;
end; $$;
drop trigger if exists notify_admin_scholar_application on public.scholar_applications;
create trigger notify_admin_scholar_application after insert on public.scholar_applications
  for each row execute function public.notify_admin_scholar_application();

create or replace function public.notify_admin_mosque_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('mosque_application', 'New mosque application',
    coalesce(NEW.org_name, 'A mosque') || ' applied to join Amanah',
    jsonb_build_object('application_id', NEW.id));
  return NEW;
end; $$;
drop trigger if exists notify_admin_mosque_application on public.mosque_applications;
create trigger notify_admin_mosque_application after insert on public.mosque_applications
  for each row execute function public.notify_admin_mosque_application();

create or replace function public.notify_admin_mosque_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('mosque_claim', 'New mosque claim',
    coalesce(NEW.claimant_name, 'Someone') || ' wants to claim a mosque',
    jsonb_build_object('claim_id', NEW.id, 'mosque_id', NEW.mosque_id));
  return NEW;
end; $$;
drop trigger if exists notify_admin_mosque_claim on public.mosque_claims;
create trigger notify_admin_mosque_claim after insert on public.mosque_claims
  for each row execute function public.notify_admin_mosque_claim();

create or replace function public.notify_admin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('flag', 'New flag reported',
    'Content was flagged for review',
    jsonb_build_object('flag_id', NEW.id));
  return NEW;
end; $$;
drop trigger if exists notify_admin_flag on public.flags;
create trigger notify_admin_flag after insert on public.flags
  for each row execute function public.notify_admin_flag();

create or replace function public.notify_admin_dbs_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_admins('dbs_order', 'New DBS order',
    'A new DBS check was ordered',
    jsonb_build_object('order_id', NEW.id));
  return NEW;
end; $$;
drop trigger if exists notify_admin_dbs_order on public.dbs_orders;
create trigger notify_admin_dbs_order after insert on public.dbs_orders
  for each row execute function public.notify_admin_dbs_order();

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, probe, then prod, probe):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- CHECK widened (insert a 'flag'-type notification as a quick test, then delete):
--        select conname from pg_constraint where conname = 'notifications_type_check';   -- 1 row
--        select proname, prosecdef from pg_proc where proname like 'notify_admin%' or proname='notify_admins';
--          -- 6 rows, all prosecdef = t
--        select tgname from pg_trigger where tgname like 'notify_admin_%';                -- 5 rows
--      Functional: as a scholar, submit an application → row appears in notifications
--        for each admin (type='scholar_application'); the admin bell shows it.
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
