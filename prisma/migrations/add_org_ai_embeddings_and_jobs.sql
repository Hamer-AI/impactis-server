-- AI embedding storage + job queue (v3.0)

create table if not exists public.org_ai_embeddings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  embedding_text text not null,
  embedding_vector jsonb not null default '[]'::jsonb,
  embedding_model text not null default 'text-embedding-3-large',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists org_ai_embeddings_org_unique
  on public.org_ai_embeddings (org_id);

create index if not exists org_ai_embeddings_updated_idx
  on public.org_ai_embeddings (updated_at desc);

create table if not exists public.ai_embedding_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  run_after timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_embedding_jobs_status_run_after_idx
  on public.ai_embedding_jobs (status, run_after);

create index if not exists ai_embedding_jobs_org_created_idx
  on public.ai_embedding_jobs (org_id, created_at desc);

