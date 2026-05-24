-- Self-learning watch-scan RAG schema
-- Postgres + pgvector. Vectors are the 256-dim projection of DINOv3 features.

create extension if not exists vector;
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- Canonical model metadata produced by zero-shot identification.
create table if not exists watch_models (
    id          uuid primary key default gen_random_uuid(),
    brand       text not null,
    ref         text not null,
    model       text,
    metadata    jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    unique (brand, ref)
);

-- Benchmark + user-verified image vectors. This is the RAG retrieval table.
create table if not exists image_embeddings (
    id                uuid primary key default gen_random_uuid(),
    brand             text not null,
    ref               text not null,
    model             text,
    embedding         vector(256) not null,
    embedding_version text not null,
    source            text not null check (source in ('harvester', 'user_verified')),
    source_url        text,
    confidence        real,
    is_benchmark      boolean not null default true,
    harvested_at      timestamptz,
    created_at        timestamptz not null default now()
);

-- Idempotency: one row per (model, image, embedding pipeline version).
-- source_url is the stable identity of a harvested studio image.
create unique index if not exists image_embeddings_idem
    on image_embeddings (brand, ref, source_url, embedding_version);

-- Retrieval index. Filter by embedding_version at query time, then ANN search.
create index if not exists image_embeddings_ann
    on image_embeddings using hnsw (embedding vector_cosine_ops);

create index if not exists image_embeddings_lookup
    on image_embeddings (brand, ref, embedding_version);

-- Durable async harvest queue (replaces an in-process background thread).
create table if not exists harvest_jobs (
    id                uuid primary key default gen_random_uuid(),
    brand             text not null,
    ref               text not null,
    model             text,
    confidence        real,
    -- the user-scan vector that triggered this job, used for cross-check.
    trigger_embedding vector(256),
    trigger_image_url text,
    status            text not null default 'pending'
                      check (status in ('pending','running','done','failed')),
    attempts          int not null default 0,
    max_attempts      int not null default 5,
    run_after         timestamptz not null default now(),
    last_error        text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

-- At most one active job per model: prevents duplicate harvesting.
create unique index if not exists harvest_jobs_active_uniq
    on harvest_jobs (brand, ref)
    where status in ('pending', 'running');

-- Atomic, concurrency-safe job claim for any number of workers.
create or replace function claim_harvest_job()
returns harvest_jobs
language plpgsql
as $$
declare
    job harvest_jobs;
begin
    select * into job
    from harvest_jobs
    where status = 'pending' and run_after <= now()
    order by created_at
    for update skip locked
    limit 1;

    if not found then
        return null;
    end if;

    update harvest_jobs
    set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = job.id
    returning * into job;

    return job;
end;
$$;
