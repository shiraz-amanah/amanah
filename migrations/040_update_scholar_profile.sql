-- Migration 040: scholar self-service profile editing
--
-- NOT yet applied — surfaced for approval. Apply in Supabase (dev then prod).
--
-- RLS note: same rationale as migration 039 (availability). There is NO scholar
-- self-UPDATE policy on `scholars` — the only UPDATE policies are admin-only
-- (is_admin(), migrations 020 + 028). Postgres RLS can't be column-scoped, so a
-- broad self-UPDATE policy would let a scholar also write dbs_verified /
-- ijazah_verified / status / rating / slug (privilege escalation). Instead we
-- expose a SECURITY DEFINER function that writes ONLY the editable profile
-- columns, and only for the caller's own row (user_id = auth.uid()).
--
-- Explicitly NOT touched by this function: dbs_verified, ijazah_verified,
-- dbs_verified_date, status, rating, review_count, slug, user_id.

-- Photo URL column — exists on scholar_applications (migration 015) but not yet
-- on scholars. Profile photos uploaded to the `avatars` storage bucket land here.
alter table public.scholars
  add column if not exists avatar_url text;

create or replace function public.update_scholar_profile(
  p_name       text,
  p_title      text,
  p_bio        text,
  p_avatar_url text,
  p_languages  text[],
  p_categories text[],
  p_packages   jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scholars
     set name       = coalesce(p_name, name),
         title      = p_title,
         bio        = p_bio,
         avatar_url = p_avatar_url,
         languages  = coalesce(p_languages, '{}'::text[]),
         categories = coalesce(p_categories, '{}'::text[]),
         packages   = coalesce(p_packages, '[]'::jsonb)
   where user_id = auth.uid();
end;
$$;

-- Only signed-in users can call it; anon would no-op anyway (auth.uid() null).
revoke all on function public.update_scholar_profile(text, text, text, text, text[], text[], jsonb) from public;
grant execute on function public.update_scholar_profile(text, text, text, text, text[], text[], jsonb) to authenticated;

-- Verify after apply:
--   SELECT routine_name, security_type FROM information_schema.routines
--    WHERE routine_name = 'update_scholar_profile';
