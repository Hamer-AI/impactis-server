-- pgvector Migration Path (v3.0)
-- Note: This is intended to be run only when pgvector is available on the DB.
-- Keeping it idempotent where possible.

create extension if not exists vector;

alter table public.org_ai_embeddings
  alter column embedding_vector
  type vector(1536)
  using embedding_vector::vector(1536);

create index if not exists org_ai_embeddings_vector_ivfflat_idx
  on public.org_ai_embeddings
  using ivfflat (embedding_vector vector_cosine_ops)
  with (lists = 100);

