-- 116_madrasa_lesson_transcripts.sql
-- ====================================================================
-- Lesson summaries (Live Lesson Improvement 3, Option B / v1 "notes → AI summary").
--
-- v1 has NO recording or transcription (Daily transcription isn't on the plan).
-- Instead the teacher types a few notes after the lesson and Claude expands them
-- into a polished, parent-facing summary (transcript_summary mode in admin-brief).
--   * transcript_text — the teacher's raw notes ("what did you cover today?")
--   * ai_summary      — Claude's parent-facing summary
--   * recording_url   — unused in v1; kept nullable for a future recording feature
-- The owner picks what to share (share_level + shared_with_parents); parents read
-- shared rows via a definer RPC (a raw parent policy can't hide a column, so it
-- would leak the notes even when only the summary is shared).
--
-- Also adds 'lesson_summary' to the notifications type CHECK for the "shared with
-- parents" bell (full-union rebuild, per 113). No storage bucket in v1.
-- ====================================================================

create table if not exists public.madrasa_lesson_transcripts (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references public.madrasa_sessions(id) on delete set null,
  mosque_id           uuid not null references public.mosques(id)         on delete cascade,
  class_id            uuid not null references public.madrasa_classes(id) on delete cascade,
  recording_url       text,                 -- unused in v1 (future recording)
  transcript_text     text,                 -- v1: the teacher's notes
  ai_summary          text,
  shared_with_parents boolean not null default false,
  share_level         text not null default 'none' check (share_level in ('summary', 'full', 'none')),
  created_at          timestamptz not null default now()
);
create index if not exists madrasa_lesson_transcripts_class_idx   on public.madrasa_lesson_transcripts(class_id);
create index if not exists madrasa_lesson_transcripts_mosque_idx  on public.madrasa_lesson_transcripts(mosque_id);
create index if not exists madrasa_lesson_transcripts_session_idx on public.madrasa_lesson_transcripts(session_id);

alter table public.madrasa_lesson_transcripts enable row level security;

-- Owner (+admin): full CRUD; mosque_id forced to match the class.
drop policy if exists "Owner manage lesson transcripts" on public.madrasa_lesson_transcripts;
create policy "Owner manage lesson transcripts"
  on public.madrasa_lesson_transcripts for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );
-- Class teacher: manage own-class summaries (definer helper from 070) — teachers
-- write the notes + generate the summary.
drop policy if exists "Teacher manage class transcripts" on public.madrasa_lesson_transcripts;
create policy "Teacher manage class transcripts"
  on public.madrasa_lesson_transcripts for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (public.madrasa_is_class_teacher(class_id));

-- Parent read (definer): shared rows for classes their child is enrolled in.
-- transcript_text (the notes) only when share_level = 'full'; ai_summary always.
create or replace function public.get_my_lesson_summaries()
returns table (
  id           uuid,
  class_id     uuid,
  class_name   text,
  session_at   timestamptz,
  ai_summary   text,
  notes        text,
  share_level  text,
  created_at   timestamptz
)
language sql
security definer
set search_path = public
as $$
  select t.id, t.class_id, c.name, s.started_at, t.ai_summary,
         case when t.share_level = 'full' then t.transcript_text else null end,
         t.share_level, t.created_at
  from public.madrasa_lesson_transcripts t
  join public.madrasa_classes c on c.id = t.class_id
  left join public.madrasa_sessions s on s.id = t.session_id
  where t.shared_with_parents = true and t.share_level <> 'none'
    and public.madrasa_parent_in_class(t.class_id)
  order by t.created_at desc;
$$;
revoke all on function public.get_my_lesson_summaries() from public, anon;
grant execute on function public.get_my_lesson_summaries() to authenticated;

-- 'lesson_summary' notification type for the "shared with parents" bell.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'homework', 'report', 'attendance', 'reward', 'cover_request', 'message', 'system',
    'scholar_application', 'mosque_application', 'mosque_claim', 'flag', 'dbs_order',
    'photo', 'waitlist', 'live_lesson', 'lesson_summary'
  ));

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        select table_name, column_name from information_schema.columns
--          where table_name = 'madrasa_lesson_transcripts' order by ordinal_position;
--        select tablename, polname, cmd from pg_policies
--          where tablename = 'madrasa_lesson_transcripts' order by polname;      -- 2 (owner ALL + teacher ALL)
--        select proname, prosecdef from pg_proc where proname = 'get_my_lesson_summaries';  -- prosecdef t
--        select pg_get_constraintdef(oid) from pg_constraint where conname='notifications_type_check';  -- incl lesson_summary
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
