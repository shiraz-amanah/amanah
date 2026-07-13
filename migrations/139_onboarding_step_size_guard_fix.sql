-- 139_onboarding_step_size_guard_fix.sql
-- ====================================================================
-- Session RBAC-D — FIX the save_onboarding_step size guard from 137.
--
-- 137 used  if pg_column_size(d) > 16384 then return false.  pg_column_size
-- returns the TOAST-COMPRESSED size, so a maximally-compressible payload
-- (e.g. jsonb_build_object('junk', repeat('x',20000))) shrinks to a few hundred
-- bytes and slips under the cap — the guard NEVER FIRED (confirmed on dev: a
-- 20KB junk value returned true). This is anon-callable, so a leaked token could
-- grow the jsonb — which get_onboarding_session_full renders to the mosque
-- admin — without bound.
--
-- Fix: measure LOGICAL size via octet_length(<value>::text) (uncompressed byte
-- count of the serialized JSON — immune to repetitive-junk compression). Two
-- more hardenings over 137:
--   1. Bound the MERGED RESULT, not just the incoming payload, so many small
--      calls each adding DISTINCT keys can't accumulate the column past the cap.
--   2. Reject an out-of-range p_step (137 was a silent no-op that returned true).
-- Plus a fast pre-lock reject of an oversized INCOMING payload.
--
-- 16KB per blob stays generous — the largest legitimate step is ~2KB. Still
-- anon-callable, same harvest guard, still a MERGE. create-or-replace (signature
-- + return type unchanged) preserves the 133 grants.
-- ====================================================================

create or replace function public.save_onboarding_step(p_token uuid, p_step int, p_data jsonb)
returns boolean
language plpgsql security definer volatile set search_path = public as $$
declare
  v record;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  merged jsonb;
begin
  -- Fast reject an oversized INCOMING payload before taking the row lock.
  if octet_length(d::text) > 16384 then return false; end if;

  select * into v from public.mosque_staff_onboarding_sessions where token = p_token for update;
  if not found or v.token_expires_at < now()
     or v.status not in ('in_progress','changes_requested') then
    return false;
  end if;

  -- Merge the step's keys into the matching blob; null for an invalid p_step.
  merged := case p_step
    when 1 then coalesce(v.personal_details,   '{}'::jsonb) || d
    when 2 then coalesce(v.rtw_details,        '{}'::jsonb) || d
    when 3 then coalesce(v.dbs_details,        '{}'::jsonb) || d
    when 4 then coalesce(v.employment_details, '{}'::jsonb) || d
    when 5 then coalesce(v.tax_details,        '{}'::jsonb) || d
    when 6 then coalesce(v.bank_details,       '{}'::jsonb) || d
    else null
  end;
  if merged is null then return false; end if;                    -- invalid p_step
  if octet_length(merged::text) > 16384 then return false; end if; -- bound accumulation

  update public.mosque_staff_onboarding_sessions set
    personal_details   = case when p_step = 1 then merged else personal_details   end,
    rtw_details        = case when p_step = 2 then merged else rtw_details        end,
    dbs_details        = case when p_step = 3 then merged else dbs_details        end,
    employment_details = case when p_step = 4 then merged else employment_details end,
    tax_details        = case when p_step = 5 then merged else tax_details        end,
    bank_details       = case when p_step = 6 then merged else bank_details       end,
    step_completed     = greatest(step_completed, p_step)
  where id = v.id;
  return true;
end; $$;

notify pgrst, 'reload schema';

-- ====================================================================
-- Probe on dev (RAW) — with a real in_progress session token T:
--   -- compressible junk now REJECTED (this is the 137 miss):
--   select public.save_onboarding_step('<T>'::uuid, 1, jsonb_build_object('junk', repeat('x', 20000)));  -- false
--   -- incompressible junk also rejected:
--   select public.save_onboarding_step('<T>'::uuid, 1, jsonb_build_object('junk', md5(random()::text)));  -- true (small)
--   -- invalid step rejected (137 returned true):
--   select public.save_onboarding_step('<T>'::uuid, 9, '{}'::jsonb);  -- false
--   -- legit still works + still merges:
--   select public.save_onboarding_step('<T>'::uuid, 1, jsonb_build_object('name','A'));   -- true
--   select public.save_onboarding_step('<T>'::uuid, 1, jsonb_build_object('phone','1'));  -- true
--   select personal_details from public.mosque_staff_onboarding_sessions where token='<T>';  -- {"name":"A","phone":"1"}
-- ====================================================================
