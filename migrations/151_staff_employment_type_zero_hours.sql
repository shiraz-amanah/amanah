-- 151_staff_employment_type_zero_hours.sql
-- ====================================================================
-- Session RBAC-E — Commit 3b click-test follow-up. Admit 'zero_hours' as a
-- valid mosque_staff.employment_type.
--
-- WHY: mosque/madrasah staff are commonly zero-hours (part-time teachers,
-- cover staff), but 128 pinned employment_type to five values, so the
-- Add-Staff dropdown could not offer it. The contract TEMPLATE for zero-hours
-- already existed (contractTemplates.js TYPES) and was simply unreachable from
-- employmentTypeToTemplate().
--
-- SCOPE: 'zero_hours' ONLY. 'sessional' is deliberately NOT added here —
-- its template exists but still renders the generic salaried-employee wording,
-- so surfacing it would ship a half-built contract. Extending this CHECK again
-- later is a drop+add and costs nothing.
--
-- Constraint name below is VERIFIED against dev, not inferred: a rejected
-- insert reports
--   new row for relation "mosque_staff" violates check constraint
--   "mosque_staff_employment_type_check"
-- (128 created it inline/unnamed, so Postgres auto-named it.)
--
-- SAFETY: widening a CHECK only. No table rewrite of data, no column change,
-- no RLS change, and no existing row can violate the new list (it is a strict
-- superset of the old one). Reversible — re-apply 128's list to roll back,
-- provided no row has yet been written as 'zero_hours'.
-- ====================================================================

begin;

alter table public.mosque_staff
  drop constraint if exists mosque_staff_employment_type_check;

alter table public.mosque_staff
  add constraint mosque_staff_employment_type_check
  check (employment_type in (
    'employed_full_time','employed_part_time',
    'self_employed','volunteer','contractor',
    'zero_hours'));

commit;
