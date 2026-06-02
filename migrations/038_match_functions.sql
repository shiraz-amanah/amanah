-- Migration 038: pgvector similarity RPCs for semantic scholar/mosque search
-- Used by api/ai-match.js to fetch the top-N nearest rows to a query embedding
-- before handing them to Claude for ranking + explanation.
--
-- NOT yet applied — unlike 036/037, this is new feature work. Apply in
-- Supabase (dev first, then prod via the SQL editor). Until it exists,
-- api/ai-match.js catches the missing-function error and falls back to its
-- full-candidate Claude path, so search keeps working.
--
-- Depends on: migration 036 (vector(1536) embedding columns) and the
-- embedding backfill (api/backfill-embeddings.js) having populated rows.
-- The functions are SECURITY INVOKER (default), so the caller's RLS on
-- scholars/mosques still applies.

create or replace function match_scholars(query_embedding vector(1536), match_count int)
returns table (id uuid, similarity float)
language sql stable
as $$
  select id, 1 - (embedding <=> query_embedding) as similarity
  from scholars
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_mosques(query_embedding vector(1536), match_count int)
returns table (id uuid, similarity float)
language sql stable
as $$
  select id, 1 - (embedding <=> query_embedding) as similarity
  from mosques
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
