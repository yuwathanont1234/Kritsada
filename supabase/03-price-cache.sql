-- ============================================================
-- Price Cache — share market prices across users for 7 days
-- ============================================================
-- Run AFTER 02-embeddings.sql in Supabase Dashboard → SQL Editor → Run
-- Idempotent: safe to re-run
--
-- Purpose:
--   Grounded web search via Gemini Pro for price ranges costs money
--   and latency. Popular watches (e.g. Submariner 116610LN) are searched
--   constantly. We reuse cached price records for 7 days.
--
-- Cache key:
--   slugified normalize(brand + reference + year_est).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.watch_price_cache (
  cache_key            TEXT PRIMARY KEY,
  brand                TEXT NOT NULL,
  reference            TEXT NOT NULL,
  year_est             TEXT NOT NULL DEFAULT '',

  price_range_usd      JSONB,    -- { "min": ..., "max": ..., "median": ... }
  price_by_grade       JSONB,    -- { "NOS": ..., "Mint": ..., "Used": ... }
  price_notes          TEXT,
  price_sources        JSONB,    -- [{ "url": ..., "title": ..., "priceFound": ... }]

  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  hit_count            INTEGER NOT NULL DEFAULT 0
);

-- Index for fetching sorting by fresh records
CREATE INDEX IF NOT EXISTS watch_price_cache_fetched_at_idx
  ON public.watch_price_cache (fetched_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY: public read + public write (insert/upsert).
-- Enables community-driven updates without administrative overhead.
-- ============================================================
ALTER TABLE public.watch_price_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watch_price_cache_public_read" ON public.watch_price_cache;
CREATE POLICY "watch_price_cache_public_read"
  ON public.watch_price_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "watch_price_cache_public_upsert" ON public.watch_price_cache;
CREATE POLICY "watch_price_cache_public_upsert"
  ON public.watch_price_cache
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "watch_price_cache_public_update" ON public.watch_price_cache;
CREATE POLICY "watch_price_cache_public_update"
  ON public.watch_price_cache
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "watch_price_cache_public_delete" ON public.watch_price_cache;
CREATE POLICY "watch_price_cache_public_delete"
  ON public.watch_price_cache
  FOR DELETE
  TO anon, authenticated
  USING (true);
