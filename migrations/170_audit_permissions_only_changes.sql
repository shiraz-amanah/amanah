-- Migration 170: audit permissions-only changes in update_employee_permissions
-- Gap: permissions jsonb edits wrote zero audit rows (only role_preset /
-- assigned_classes were compared). Adds old-value capture + comparison +
-- from/to in details. Shape matches 157 header: staff_id NULL, employee
-- id in details.

create or replace function public.update_employee_permissions(
  p_employee_id uuid, p_permissions jsonb,
  p_assigned_classes uuid[], p_role_preset text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_uid                  uuid := auth.uid();
  v_mosque_id            uuid;
  v_old_role_preset      text;
  v_old_assigned_classes uuid[];
  v_old_permissions      jsonb;
  v_new_role_preset      text;
  v_new_assigned_classes uuid[];
  v_new_permissions      jsonb;
begin
  select e.mosque_id, e.role_preset, e.assigned_classes, e.permissions
    into v_mosque_id, v_old_role_preset, v_old_assigned_classes, v_old_permissions
    from public.mosque_employees e
   where e.id = p_employee_id;

  if v_mosque_id is null then
    raise exception 'employee_not_found';
  end if;

  if not exists (select 1 from public.mosques m
                 where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;

  if p_role_preset is not null and p_role_preset not in
     ('coordinator','teacher','treasurer','receptionist','viewer','custom') then
    raise exception 'invalid_role_preset';
  end if;

  if p_assigned_classes is not null and array_length(p_assigned_classes, 1) is not null then
    if exists (
      select 1 from unnest(p_assigned_classes) as cid
      where cid not in (select id from public.madrasa_classes where mosque_id = v_mosque_id)
    ) then
      raise exception 'assigned_class_not_in_mosque';
    end if;
  end if;

  update public.mosque_employees
     set permissions      = coalesce(p_permissions, permissions),
         assigned_classes = coalesce(p_assigned_classes, assigned_classes),
         role_preset      = coalesce(p_role_preset, role_preset)
   where id = p_employee_id;

  v_new_role_preset      := coalesce(p_role_preset, v_old_role_preset);
  v_new_assigned_classes := coalesce(p_assigned_classes, v_old_assigned_classes);
  v_new_permissions      := coalesce(p_permissions, v_old_permissions);

  if v_new_role_preset is distinct from v_old_role_preset
     or v_new_assigned_classes is distinct from v_old_assigned_classes
     or v_new_permissions is distinct from v_old_permissions then
    insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
      values (v_mosque_id, v_uid, null, 'employee_permissions_changed',
              jsonb_build_object(
                'employee_id', p_employee_id,
                'role_preset', jsonb_build_object('from', v_old_role_preset, 'to', v_new_role_preset),
                'assigned_classes', jsonb_build_object(
                  'from', to_jsonb(v_old_assigned_classes),
                  'to',   to_jsonb(v_new_assigned_classes)),
                'permissions', jsonb_build_object(
                  'from', v_old_permissions,
                  'to',   v_new_permissions)
              ));
  end if;
end;
$function$;
