-- Expert verification tier for harvested benchmarks.
-- Harvested rows start unverified (auto-collected); an expert promotes the
-- trustworthy ones to verified=true, which the matcher prefers and trusts more.

alter table watch_embeddings
    add column if not exists verified     boolean not null default false,
    add column if not exists verified_at  timestamptz,
    add column if not exists verified_by  text;

create index if not exists watch_embeddings_verified
    on watch_embeddings (brand, ref, embedding_version, verified);
