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
-- Also adds mosque_staff_employment.hourly_rate_pence: zero-hours staff are paid
-- an hourly rate for hours actually worked, and 128 gave that table salary_pence
-- ONLY (the schema's other hourly_rate is on facilities/105 — unrelated), so the
-- rate had nowhere to live but the contract JSON. Nullable, no default; lands on
-- mosque_staff_employment (NOT mosque_staff) so it inherits 060's owner+admin-only
-- RLS — same reasoning as 128 kept salary_pence off the publicly-readable table.
--
-- SAFETY: widening a CHECK + adding a nullable column. No data rewrite, no RLS
-- change, no existing row can violate the new list (it is a strict superset of
-- the old one), and `add column if not exists` is a metadata-only change with no
-- table rewrite. Reversible — re-apply 128's list to roll back, provided no row
-- has yet been written as 'zero_hours'.
-- ====================================================================

begin;

-- 1) Admit 'zero_hours' as an employment_type.
alter table public.mosque_staff
  drop constraint if exists mosque_staff_employment_type_check;

alter table public.mosque_staff
  add constraint mosque_staff_employment_type_check
  check (employment_type in (
    'employed_full_time','employed_part_time',
    'self_employed','volunteer','contractor',
    'zero_hours'));

-- 2) Somewhere for the zero-hours hourly rate to live (owner-only via 060 RLS).
alter table public.mosque_staff_employment
  add column if not exists hourly_rate_pence integer;

commit;

notify pgrst, 'reload schema';
