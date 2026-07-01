-- 106_governance.sql
-- ====================================================================
-- Governance + AI module (Session BB). Admin-only (owner RLS across the board;
-- governance is not member-facing this session). 7 tables + a pgvector RAG
-- table + an owner-scoped match RPC for document Q&A.
--
-- AI is all reuse (Vercel is 12/12): the assistant + daily brief + minute
-- extraction fold into /api/admin-brief; document embeddings go through the
-- existing /api/embed (a one-line type widening); RAG retrieval is the
-- match_governance_chunks RPC below (modelled on 038 match_scholars).
--
-- Constitution / document Q&A works over doc_text (pasted or .txt) — PDF/Word
-- files are stored for humans in the governance-docs bucket, but the AI reads
-- the text field (no server-side PDF parsing; that's a later enhancement).
--
-- Dev first, probe, then prod.
-- ====================================================================

create extension if not exists vector;   -- pgvector (036 already enabled it)

-- 1. Committee members ---------------------------------------------------------
create table if not exists public.governance_committee_members (
  id                  uuid primary key default gen_random_uuid(),
  mosque_id           uuid not null references public.mosques(id) on delete cascade,
  community_member_id uuid references public.community_members(id) on delete set null,  -- optional link
  name                text not null,
  role                text not null check (role in ('chair','treasurer','secretary','trustee','general_member','advisor')),
  email               text,
  phone               text,
  term_start          date,
  term_end            date,
  fee_status          text not null default 'outstanding' check (fee_status in ('paid','outstanding','waived')),
  notes               text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists gov_committee_mosque_idx on public.governance_committee_members(mosque_id, active);

-- 2. Meetings ------------------------------------------------------------------
create table if not exists public.governance_meetings (
  id             uuid primary key default gen_random_uuid(),
  mosque_id      uuid not null references public.mosques(id) on delete cascade,
  type           text not null check (type in ('agm','committee','extraordinary','sub_committee')),
  title          text,
  meeting_date   date not null,
  location       text,
  is_online      boolean not null default false,
  quorum_met     boolean,
  minutes_text   text,          -- pasted/raw minutes
  minutes_doc_url text,         -- uploaded minutes file (governance-docs bucket path)
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists gov_meetings_mosque_idx on public.governance_meetings(mosque_id, meeting_date desc);

-- 3. Meeting attendees (links committee members) -------------------------------
create table if not exists public.governance_attendees (
  id                  uuid primary key default gen_random_uuid(),
  meeting_id          uuid not null references public.governance_meetings(id) on delete cascade,
  committee_member_id uuid references public.governance_committee_members(id) on delete cascade,
  name                text,       -- snapshot / non-committee attendee
  present             boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists gov_attendees_meeting_idx on public.governance_attendees(meeting_id);
create unique index if not exists gov_attendees_uniq
  on public.governance_attendees(meeting_id, committee_member_id) where committee_member_id is not null;

-- 4. Agenda items (ordered) ----------------------------------------------------
create table if not exists public.governance_agenda_items (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.governance_meetings(id) on delete cascade,
  position    integer not null default 0,
  title       text not null,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists gov_agenda_meeting_idx on public.governance_agenda_items(meeting_id, position);

-- 5. Actions (cross-meeting tracker) -------------------------------------------
-- status is the intended state; "overdue" is DERIVED (due_date < today and
-- status <> 'complete') in the app, not stored.
create table if not exists public.governance_actions (
  id                  uuid primary key default gen_random_uuid(),
  mosque_id           uuid not null references public.mosques(id) on delete cascade,     -- denormalized for the tracker + RLS
  meeting_id          uuid references public.governance_meetings(id) on delete set null, -- null = standalone action
  committee_member_id uuid references public.governance_committee_members(id) on delete set null, -- assignee
  description         text not null,
  due_date            date,
  status              text not null default 'open' check (status in ('open','in_progress','complete')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists gov_actions_mosque_idx on public.governance_actions(mosque_id, status);
create index if not exists gov_actions_owner_idx  on public.governance_actions(committee_member_id);

-- 6. Documents -----------------------------------------------------------------
create table if not exists public.governance_documents (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  category    text,          -- constitution / charity_registration / annual_accounts / governing_document / other
  title       text not null,
  doc_url     text,          -- uploaded file (governance-docs bucket path)
  doc_text    text,          -- extracted/pasted text used for RAG (nullable)
  doc_date    date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists gov_documents_mosque_idx on public.governance_documents(mosque_id);

-- 7. Document chunks for RAG (pgvector) ----------------------------------------
create table if not exists public.governance_document_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.governance_documents(id) on delete cascade,
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  content     text not null,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);
create index if not exists gov_chunks_doc_idx on public.governance_document_chunks(document_id);
create index if not exists gov_chunks_embedding_idx
  on public.governance_document_chunks using hnsw (embedding vector_cosine_ops);

-- ---- RLS: owner-only across the whole module --------------------------------
-- Direct-mosque tables:
alter table public.governance_committee_members enable row level security;
alter table public.governance_meetings          enable row level security;
alter table public.governance_actions           enable row level security;
alter table public.governance_documents         enable row level security;
alter table public.governance_document_chunks   enable row level security;
-- Child tables (scoped via their meeting → mosque):
alter table public.governance_attendees         enable row level security;
alter table public.governance_agenda_items      enable row level security;

drop policy if exists "Owner manage governance_committee_members" on public.governance_committee_members;
create policy "Owner manage governance_committee_members" on public.governance_committee_members
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

drop policy if exists "Owner manage governance_meetings" on public.governance_meetings;
create policy "Owner manage governance_meetings" on public.governance_meetings
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

drop policy if exists "Owner manage governance_actions" on public.governance_actions;
create policy "Owner manage governance_actions" on public.governance_actions
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

drop policy if exists "Owner manage governance_documents" on public.governance_documents;
create policy "Owner manage governance_documents" on public.governance_documents
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

drop policy if exists "Owner manage governance_document_chunks" on public.governance_document_chunks;
create policy "Owner manage governance_document_chunks" on public.governance_document_chunks
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Attendees + agenda items: owner-scoped through the parent meeting.
drop policy if exists "Owner manage governance_attendees" on public.governance_attendees;
create policy "Owner manage governance_attendees" on public.governance_attendees
  for all to authenticated
  using (meeting_id in (select gm.id from public.governance_meetings gm
    join public.mosques m on m.id = gm.mosque_id where m.user_id = auth.uid()))
  with check (meeting_id in (select gm.id from public.governance_meetings gm
    join public.mosques m on m.id = gm.mosque_id where m.user_id = auth.uid()));

drop policy if exists "Owner manage governance_agenda_items" on public.governance_agenda_items;
create policy "Owner manage governance_agenda_items" on public.governance_agenda_items
  for all to authenticated
  using (meeting_id in (select gm.id from public.governance_meetings gm
    join public.mosques m on m.id = gm.mosque_id where m.user_id = auth.uid()))
  with check (meeting_id in (select gm.id from public.governance_meetings gm
    join public.mosques m on m.id = gm.mosque_id where m.user_id = auth.uid()));

-- ---- RAG retrieval: owner-scoped nearest chunks (modelled on 038) -----------
create or replace function public.match_governance_chunks(
  p_mosque_id uuid, query_embedding vector(1536), match_count int
) returns table (content text, similarity float)
language sql
stable
security definer
set search_path = public
as $$
  select c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.governance_document_chunks c
  where c.mosque_id = p_mosque_id
    and c.embedding is not null
    and (p_mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
revoke all     on function public.match_governance_chunks(uuid, vector, int) from public, anon;
grant  execute on function public.match_governance_chunks(uuid, vector, int) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev pbej first, probe RAW rows, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe:
--      select relname, relrowsecurity from pg_class where relname like 'governance_%';   -- 7 rows, all t
--      select tablename, polname from pg_policies where tablename like 'governance_%' order by tablename; -- 7 rows
--      select proname, prosecdef from pg_proc where proname='match_governance_chunks';    -- 1 row, t
--      select 1 from pg_indexes where indexname='gov_chunks_embedding_idx';               -- 1 row (hnsw)
--   3. Functional (as owner): insert a committee member / meeting / action → reads back;
--      as a non-owner: 0 rows. match_governance_chunks needs embedded chunks (RAG phase).
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================
