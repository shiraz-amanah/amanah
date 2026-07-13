-- 137_onboarding_step_merge.sql
-- ====================================================================
-- Session RBAC-D — make save_onboarding_step MERGE each step's jsonb into the
-- existing column (col = coalesce(col,'{}') || p_data) instead of OVERWRITING it.
--
-- Why: bank_details + NI are WRITE-ONLY — get_onboarding_session_by_token strips
-- ni_number and never returns bank_details (masked "saved — re-enter to change"
-- on the client). With overwrite semantics, a resumed employee saving step 1
-- (personal) without re-typing their NI, or advancing past step 6 (bank) without
-- re-typing bank, would WIPE the previously-saved sensitive value it can't see.
-- Merge lets the client OMIT masked-unchanged fields (they persist) while still
-- updating everything it does send. Non-masked fields are always sent (including
-- ""), so they still overwrite/clear normally.
--
-- Within-step merge is collision-free (a step's blob only carries its own keys);
-- this is unrelated to the cross-step merge that approve_onboarding_session
-- deliberately AVOIDS (133 #6 reads named blobs).
--
-- Same anon harvest guard as 133 (exists, not expired, resumable status).
-- create-or-replace (signature + return type unchanged) preserves grants.
-- ====================================================================

create or replace function public.save_onboarding_step(p_token uuid, p_step int, p_data jsonb)
returns boolean
language plpgsql security definer volatile set search_path = public as $$
declare v record; d jsonb := coalesce(p_data, '{}'::jsonb);
begin
  -- Anon size guard: save_onboarding_step is anon-callable and merges arbitrary
  -- client keys into an unbounded jsonb column that get_onboarding_session_full
  -- renders to the mosque admin. A leaked token could otherwise grow it without
  -- limit. 16KB >> any legitimate step (the largest real payload is ~2KB). NO key
  -- whitelist — that would couple this RPC to the wizard's field list, which
  -- RBAC-E is about to change; junk keys are already ignored at promotion
  -- (approve_onboarding_session reads named keys from named blobs).
  if pg_column_size(d) > 16384 then return false; end if;
  select * into v from public.mosque_staff_onboarding_sessions where token = p_token for update;
  if not found or v.token_expires_at < now()
     or v.status not in ('in_progress','changes_requested') then
    return false;
  end if;

  update public.mosque_staff_onboarding_sessions set
    personal_details   = case when p_step = 1 then coalesce(personal_details,'{}'::jsonb)   || d else personal_details   end,
    rtw_details        = case when p_step = 2 then coalesce(rtw_details,'{}'::jsonb)        || d else rtw_details        end,
    dbs_details        = case when p_step = 3 then coalesce(dbs_details,'{}'::jsonb)        || d else dbs_details        end,
    employment_details = case when p_step = 4 then coalesce(employment_details,'{}'::jsonb) || d else employment_details end,
    tax_details        = case when p_step = 5 then coalesce(tax_details,'{}'::jsonb)        || d else tax_details        end,
    bank_details       = case when p_step = 6 then coalesce(bank_details,'{}'::jsonb)       || d else bank_details       end,
    step_completed     = greatest(step_completed, p_step)
  where id = v.id;
  return true;
end; $$;

notify pgrst, 'reload schema';

-- Probe: save a step twice with different keys, confirm both persist (merge, not
-- overwrite). e.g. save step 1 {"name":"A"} then {"phone":"1"} → personal_details
-- has BOTH name and phone.
