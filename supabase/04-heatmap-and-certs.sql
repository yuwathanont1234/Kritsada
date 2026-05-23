-- ============================================================
-- Expert Certificates, Fake Reference Vectors, & Landmark Heatmaps
-- ============================================================
-- Run AFTER 03-price-cache.sql in Supabase Dashboard → SQL Editor → Run
-- Idempotent: safe to re-run
-- ============================================================

-- ============================================================
-- TABLE: expert_cert_exemplars
--   Authoritative reference certs (Sotheby's, RSC, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expert_cert_exemplars (
  cert_id           TEXT PRIMARY KEY,
  watch_name        TEXT NOT NULL,
  watch_reference   TEXT,
  brand             TEXT,
  case_material     TEXT,
  year_made         TEXT,
  cert_date         DATE,
  cert_url          TEXT NOT NULL,
  matched_watch_id  TEXT REFERENCES public.watches(id) ON DELETE SET NULL,
  image_count       INT NOT NULL DEFAULT 0,
  scraped_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source            TEXT NOT NULL DEFAULT 'auction_house'
);

CREATE INDEX IF NOT EXISTS idx_expert_cert_brand        ON public.expert_cert_exemplars(brand);
CREATE INDEX IF NOT EXISTS idx_expert_cert_matched_id  ON public.expert_cert_exemplars(matched_watch_id);

-- ============================================================
-- TABLE: expert_cert_embeddings
--   Multiple angles per expert certificate
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expert_cert_embeddings (
  cert_id      TEXT NOT NULL REFERENCES public.expert_cert_exemplars(cert_id) ON DELETE CASCADE,
  image_index  INT  NOT NULL,
  embedding    VECTOR(1024) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cert_id, image_index)
);

-- Cosine similarity HNSW index for expert cert embeddings
CREATE INDEX IF NOT EXISTS idx_expert_cert_embedding_cosine
  ON public.expert_cert_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- TABLE: fake_embeddings
--   Visual fingerprints of known counterfeit watches (e.g. from forums/seizures)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fake_embeddings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id          TEXT REFERENCES public.watches(id) ON DELETE SET NULL,
  source_url        TEXT,
  image_url         TEXT NOT NULL,
  embedding         VECTOR(1024) NOT NULL,
  fake_signal_notes TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cosine similarity HNSW index for counterfeit reference vectors
CREATE INDEX IF NOT EXISTS idx_fake_embeddings_cosine
  ON public.fake_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- TABLE: heatmap_annotations
--   Heatmap landmarks normalized onto a watch reference template
-- ============================================================
CREATE TABLE IF NOT EXISTS public.heatmap_annotations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_id          TEXT NOT NULL REFERENCES public.watches(id) ON DELETE CASCADE,
  region_name       TEXT NOT NULL,
  bbox              JSONB NOT NULL, -- { "x": ..., "y": ..., "w": ..., "h": ... } normalized 0-1
  signal_polarity   TEXT NOT NULL CHECK (signal_polarity IN ('supports_real', 'supports_fake')),
  importance_score  INTEGER NOT NULL CHECK (importance_score BETWEEN 1 AND 10),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heatmap_annotations_watch_id ON public.heatmap_annotations(watch_id);

-- ============================================================
-- ROW LEVEL SECURITY: public read for all
-- ============================================================
ALTER TABLE public.expert_cert_exemplars  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expert_cert_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fake_embeddings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heatmap_annotations     ENABLE ROW LEVEL SECURITY;

-- Select policies
DROP POLICY IF EXISTS "expert_cert_exemplars_read" ON public.expert_cert_exemplars;
CREATE POLICY "expert_cert_exemplars_read" ON public.expert_cert_exemplars FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "expert_cert_embeddings_read" ON public.expert_cert_embeddings;
CREATE POLICY "expert_cert_embeddings_read" ON public.expert_cert_embeddings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "fake_embeddings_read" ON public.fake_embeddings;
CREATE POLICY "fake_embeddings_read" ON public.fake_embeddings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "heatmap_annotations_read" ON public.heatmap_annotations;
CREATE POLICY "heatmap_annotations_read" ON public.heatmap_annotations FOR SELECT TO anon, authenticated USING (true);

-- ============================================================
-- RPC: match_expert_cert
--   Returns top-K expert certificate exemplars ranked by similarity.
-- ============================================================
DROP FUNCTION IF EXISTS public.match_expert_cert(vector, integer, double precision);

CREATE OR REPLACE FUNCTION public.match_expert_cert(
  query_embedding vector(1024),
  match_count     integer DEFAULT 5,
  max_distance    double precision DEFAULT 1.0
)
RETURNS TABLE (
  cert_id             text,
  watch_name          text,
  watch_reference     text,
  brand               text,
  case_material       text,
  year_made           text,
  cert_url            text,
  matched_watch_id    text,
  image_index         integer,
  distance            double precision
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
SET hnsw.ef_search = 80
SET statement_timeout = '30s'
AS $$
  SELECT
    ece.cert_id,
    ece.watch_name,
    ece.watch_reference,
    ece.brand,
    ece.case_material,
    ece.year_made,
    ece.cert_url,
    ece.matched_watch_id,
    eceb.image_index,
    (eceb.embedding <=> query_embedding)::double precision AS distance
  FROM public.expert_cert_embeddings eceb
  JOIN public.expert_cert_exemplars ece ON eceb.cert_id = ece.cert_id
  WHERE (eceb.embedding <=> query_embedding) <= max_distance
  ORDER BY eceb.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_expert_cert(vector, integer, double precision) TO anon, authenticated;

-- ============================================================
-- RPC: match_fake_embeddings
--   Returns top-K counterfeit references ranked by similarity.
-- ============================================================
DROP FUNCTION IF EXISTS public.match_fake_embeddings(vector, integer, double precision);

CREATE OR REPLACE FUNCTION public.match_fake_embeddings(
  query_embedding vector(1024),
  match_count     integer DEFAULT 5,
  max_distance    double precision DEFAULT 1.0
)
RETURNS TABLE (
  id                  uuid,
  watch_id            text,
  source_url          text,
  image_url           text,
  fake_signal_notes   text,
  distance            double precision
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
SET hnsw.ef_search = 80
SET statement_timeout = '30s'
AS $$
  SELECT
    fe.id,
    fe.watch_id,
    fe.source_url,
    fe.image_url,
    fe.fake_signal_notes,
    (fe.embedding <=> query_embedding)::double precision AS distance
  FROM public.fake_embeddings fe
  WHERE (fe.embedding <=> query_embedding) <= max_distance
  ORDER BY fe.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_fake_embeddings(vector, integer, double precision) TO anon, authenticated;
