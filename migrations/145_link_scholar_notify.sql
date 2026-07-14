-- 145_link_scholar_notify.sql
-- ====================================================================
-- Adds the in-app notification half of the "scholar has been linked as staff"
-- signal (the email half is client-triggered via send-transactional). Until now
-- linking a scholar (migration 144) was SILENT — no email, no notification — so
-- a linked scholar was never told they'd been added or how to sign in. This is
-- the server-side, durable backstop: it fires INSIDE the link RPC on a genuine
-- first link, so it survives a client-side email hiccup.
--
-- Only change vs 144: on `not v_already` (first link, not an idempotent re-link)
-- the RPC now writes a notification to the scholar. type 'system' — there is no
-- dedicated notifications type for this and adding one would mean altering the
-- notifications_type_check CHECK + teaching the client feed to render it; 'system'
-- is the generic bucket and renders wherever notifications already surface.
-- Everything else (owner gate, claimed+active checks, profile_id-forgery boundary,
-- idempotent upsert, jsonb return) is byte-identical to 144.
-- ====================================================================

begin;

create or replace function public.mosque_link_scholar_to_staff(
  p_mosque_id uuid,
  p_scholar_id uuid,
  p_role text default 'Scholar'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid          uuid := auth.uid();
  v_scholar      record;
  v_email        text;
  v_existing     record;
  v_staff_id     uuid;
  v_already      boolean := false;
  v_mosque_name  text;
  v_final_role   text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Caller must OWN the mosque they are linking into.
  if not exists (
    select 1 from public.mosques m
     where m.id = p_mosque_id and m.user_id = v_uid
  ) then
    raise exception 'not_mosque_owner';
  end if;

  -- Load the scholar. Must be claimed (has an account) and active.
  -- (scholars has no email column; the directory email comes from the account.)
  select s.id, s.user_id, s.name, s.status
    into v_scholar
    from public.scholars s
   where s.id = p_scholar_id;

  if not found then
    raise exception 'scholar_not_found';
  end if;
  if v_scholar.user_id is null then
    raise exception 'scholar_unclaimed';
  end if;
  if v_scholar.status is distinct from 'active' then
    raise exception 'scholar_not_active';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_scholar.user_id) then
    raise exception 'scholar_no_profile';
  end if;

  -- Directory email for the staff row: the scholar's account email.
  select u.email into v_email from auth.users u where u.id = v_scholar.user_id;

  -- Idempotency / de-dup: reuse an existing non-archived row for this person.
  select ms.id, ms.invite_status
    into v_existing
    from public.mosque_staff ms
   where ms.mosque_id = p_mosque_id
     and coalesce(ms.archived, false) = false
     and (ms.linked_scholar_id = p_scholar_id or ms.profile_id = v_scholar.user_id)
   order by (ms.invite_status = 'active') desc, ms.created_at asc
   limit 1;

  if found then
    v_already := (v_existing.invite_status = 'active');
    update public.mosque_staff
       set profile_id        = v_scholar.user_id,
           linked_scholar_id = p_scholar_id,
           invite_status     = 'active',
           status            = 'active',
           name              = coalesce(name, v_scholar.name),
           email             = coalesce(email, v_email),
           updated_at        = now()
     where id = v_existing.id;
    v_staff_id := v_existing.id;
  else
    insert into public.mosque_staff
      (mosque_id, profile_id, linked_scholar_id, role,
       invite_status, status, name, email)
    values
      (p_mosque_id, v_scholar.user_id, p_scholar_id, coalesce(nullif(btrim(p_role), ''), 'Scholar'),
       'active', 'active', v_scholar.name, v_email)
    returning id into v_staff_id;
  end if;

  -- migration 145: on a genuine FIRST link, notify the scholar in-app (durable,
  -- server-side backstop to the client-sent email). Skipped on re-link.
  if not v_already then
    select name into v_mosque_name from public.mosques where id = p_mosque_id;
    select role into v_final_role from public.mosque_staff where id = v_staff_id;
    perform public.create_notification(
      v_scholar.user_id,
      'system',
      'You''ve been added as staff',
      coalesce(v_mosque_name, 'A mosque') || ' has added you to their team as '
        || coalesce(v_final_role, 'Scholar') || '. You now have access to the staff portal.',
      jsonb_build_object('mosque_id', p_mosque_id, 'staff_id', v_staff_id)
    );
  end if;

  return jsonb_build_object(
    'staff_id', v_staff_id,
    'profile_id', v_scholar.user_id,
    'linked_scholar_id', p_scholar_id,
    'already_linked', v_already
  );
end;
$function$;

commit;

notify pgrst, 'reload schema';
