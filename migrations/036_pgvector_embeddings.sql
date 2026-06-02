-- Migration 036: pgvector embeddings for semantic scholar and mosque search
-- Enables AI-powered similarity search with continuous learning from user behaviour
-- Applied directly to prod before this migration file was created.
-- Requires pgvector extension (pre-installed on Supabase).

create extension if not exists vector;

alter table scholars add column if not exists embedding vector(1536);
alter table mosques add column if not exists embedding vector(1536);

create index if not exists scholars_embedding_idx on scholars using hnsw (embedding vector_cosine_ops);
create index if not exists mosques_embedding_idx on mosques using hnsw (embedding vector_cosine_ops);
