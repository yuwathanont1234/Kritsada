-- 0015_match_watches_1024.sql
-- ─────────────────────────────────────────────────────────────────────────
-- #5 ROOT CAUSE FIX — match Visual RAG on the raw 1024-d DINOv3 vectors.
--
-- Visual RAG has been matching on image_embedding_v2 — the 256-d LINEAR-PROBE
-- projection. Measured against the raw 1024-d embeddings (same DB rows), the
-- probe space has near-RANDOM brand discrimination:
--
--     same-brand@10 (catalog↔catalog self-match, 2000-row sample)
--       256-d probe : 3.0 / 10   (Audemars 0/10, Omega 1/10, TAG 2/10 — random)
--       raw 1024-d  : 10.0 / 10  (perfect — every seed's top-10 same brand)
--
--     first cross-brand neighbour in 1024-d:
--       Rolex GMT → rank 49 · Rolex Submariner → rank 366 · Patek Nautilus → rank 169
--
-- That is why a live Rolex GMT scan retrieved a TAG Heuer Carrera as its top
-- "match" → no brand agreement → "Reference DB Match: not found" on essentially
-- every scan. The probe (trained for a different, identity-lossy objective)
-- collapses brands together; the raw 1024-d does not.
--
-- The raw 1024-d vectors (image_embedding) AND their HNSW index
-- (idx_image_embeddings_1024_hnsw) already exist for all 30,751 rows — this
-- migration only adds the matching RPC so retrieval can finally use them.
-- Mirrors match_watches_v2 exactly, on image_embedding (1024-d) instead of
-- image_embedding_v2 (256-d). Additive and safe: match_watches_v2 is untouched,
-- so the client can shadow-compare before switching over.
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.match_watches(vector, integer, double precision);

CREATE OR REPLACE FUNCTION public.match_watches(
  query_embedding vector(1024),
  match_count     integer DEFAULT 20,
  max_distance    double precision DEFAULT 1.0
)
RETURNS TABLE (
  watch_id            text,
  name                text,
  brand               text,
  reference           text,
  image_url           text,
  embedding_source    text,
  distance            double precision
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
SET statement_timeout = '30s'
-- NOTE: match_watches_v2 also pins `SET hnsw.ef_search = 80`, but that can only
-- be set by a privileged role (CLI/superuser) — the dashboard `postgres` role
-- gets "42501: permission denied to set parameter hnsw.ef_search". Omitted here
-- so this runs in the SQL editor. Default ef_search (40) >= our match_count (20)
-- so top-20 recall is unaffected; the 1024-d brand separation is huge anyway
-- (first cross-brand neighbour at rank 49-366). To raise it later, set it at the
-- role level via CLI: ALTER ROLE authenticator SET hnsw.ef_search = 80;
AS $$
  SELECT
    w.id AS watch_id,
    w.name,
    w.brand,
    w.reference,
    ie.image_url,
    ie.embedding_source,
    (ie.image_embedding <=> query_embedding)::double precision AS distance
  FROM public.image_embeddings ie
  JOIN public.watches w ON ie.watch_id = w.id
  WHERE ie.image_embedding IS NOT NULL
    AND (ie.image_embedding <=> query_embedding) <= max_distance
  ORDER BY ie.image_embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_watches(vector, integer, double precision)
  TO anon, authenticated, service_role;
