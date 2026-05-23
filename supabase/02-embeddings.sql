-- ============================================================
-- Visual RAG — Image embeddings for luxury watch references
-- ============================================================
-- Run AFTER 01-schema.sql in Supabase Dashboard → SQL Editor → Run
-- Idempotent: safe to re-run
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- TABLE: image_embeddings (Supports multiple images per watch)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.image_embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id        TEXT NOT NULL REFERENCES public.watches(id) ON DELETE CASCADE,
  image_url       TEXT NOT NULL,
  image_embedding VECTOR(1024), -- DINOv3 1024-d base
  image_embedding_v2 VECTOR(256), -- Linear Probe 256-d projected
  embedding_source TEXT NOT NULL CHECK (embedding_source IN ('cert', 'ref', 'user', 'fake')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
-- HNSW index for high-performance cosine similarity on 1024d vectors
CREATE INDEX IF NOT EXISTS idx_image_embeddings_1024_hnsw
  ON public.image_embeddings
  USING hnsw (image_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- HNSW index for high-performance cosine similarity on 256d projected vectors
CREATE INDEX IF NOT EXISTS idx_image_embeddings_256_hnsw
  ON public.image_embeddings
  USING hnsw (image_embedding_v2 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- RPC: match_watches_v2
--   Returns top-K watches ranked by cosine similarity in the 256-d projected space.
-- ============================================================
DROP FUNCTION IF EXISTS public.match_watches_v2(vector, integer, double precision);

CREATE OR REPLACE FUNCTION public.match_watches_v2(
  query_embedding vector(256),
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
SET hnsw.ef_search = 80
SET statement_timeout = '30s'
AS $$
  SELECT
    w.id AS watch_id,
    w.name,
    w.brand,
    w.reference,
    ie.image_url,
    ie.embedding_source,
    (ie.image_embedding_v2 <=> query_embedding)::double precision AS distance
  FROM public.image_embeddings ie
  JOIN public.watches w ON ie.watch_id = w.id
  WHERE ie.image_embedding_v2 IS NOT NULL
    AND (ie.image_embedding_v2 <=> query_embedding) <= max_distance
  ORDER BY ie.image_embedding_v2 <=> query_embedding
  LIMIT match_count;
$$;

-- Allow anon role to call the RPC
GRANT EXECUTE ON FUNCTION public.match_watches_v2(vector, integer, double precision)
  TO anon, authenticated;

-- ============================================================
-- ROW LEVEL SECURITY: public read, no public write
-- ============================================================
ALTER TABLE public.image_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "image_embeddings_public_read" ON public.image_embeddings;
CREATE POLICY "image_embeddings_public_read"
  ON public.image_embeddings
  FOR SELECT
  TO anon, authenticated
  USING (true);
