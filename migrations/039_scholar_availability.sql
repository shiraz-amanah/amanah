-- Migration 039: weekly recurring availability for scholars
-- Slot shape: { day: "saturday", start: "10:00", end: "13:00" } (day lowercase).
--
-- NOT yet applied — surfaced for approval. Apply in Supabase (dev then prod).
--
-- RLS note: there is NO scholar self-UPDATE policy on `scholars` — the only
-- UPDATE policies are admin-only (is_admin(), migrations 020 + 028). A broad
-- self-UPDATE policy can't be column-scoped in Postgres RLS, so it would let a
-- scholar also write dbs_verified / ijazah_verified / status / rating (privilege
-- escalation, same class as roadmap #40/#41). Instead we expose a SECURITY
-- DEFINER function that writes ONLY the availability column, and only for the
-- caller's own row (user_id = auth.uid()).

alter table public.scholars
  add column if not exists availability jsonb not null default '[]'::jsonb;

create or replace function public.update_scholar_availability(p_slots jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scholars
     set availability = coalesce(p_slots, '[]'::jsonb)
   where user_id = auth.uid();
end;
$$;

-- Only signed-in users can call it; anon would no-op anyway (auth.uid() null).
revoke all on function public.update_scholar_availability(jsonb) from public;
grant execute on function public.update_scholar_availability(jsonb) to authenticated;
