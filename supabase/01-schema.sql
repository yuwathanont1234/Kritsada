-- ============================================================
-- Luxury Watch Authenticator — Watches Reference Database Schema
-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor → Run
-- Idempotent: safe to re-run (uses IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- Enable trigram extension for fuzzy name search (used for search matching)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- TABLE: watches
-- ============================================================
CREATE TABLE IF NOT EXISTS public.watches (
  -- Primary key (e.g. "rolex-submariner-116610ln")
  id              TEXT PRIMARY KEY,

  -- Basic identification
  name            TEXT NOT NULL,
  alt_names       TEXT[] NOT NULL DEFAULT '{}',
  brand           TEXT NOT NULL,
  reference       TEXT NOT NULL,

  -- Classification
  category        TEXT NOT NULL CHECK (category IN (
                    'rolex','patek','ap','omega','cartier','tag-heuer','tudor','others'
                  )),
  movement_family TEXT NOT NULL,
  case_material   TEXT NOT NULL,
  dial_color      TEXT NOT NULL,
  year_created    TEXT NOT NULL,

  -- Identification
  difficulty      TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard','expert-only')),
  popular_references JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Educational checklist + fakes (JSONB arrays of objects)
  auth_checklist  JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_fakes    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Price data
  price_market_excellent  BIGINT NOT NULL,
  price_market_good       BIGINT NOT NULL,
  price_market_fair       BIGINT NOT NULL,
  price_trend             TEXT NOT NULL CHECK (price_trend IN ('rising','stable','declining')),
  price_last_updated      TEXT NOT NULL,
  recent_auctions         JSONB,

  -- Story
  history         TEXT NOT NULL,
  significance    TEXT NOT NULL,
  legends         TEXT[],

  -- Data quality
  data_confidence         TEXT NOT NULL CHECK (data_confidence IN ('high','medium','low')),
  data_sources            TEXT[] NOT NULL DEFAULT '{}',
  reference_image_count   INTEGER NOT NULL DEFAULT 0,
  reference_images        JSONB,

  -- AI matching hints
  visual_signatures   TEXT[] NOT NULL DEFAULT '{}',
  unique_identifiers  TEXT[] NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
-- Fast brand/category filters
CREATE INDEX IF NOT EXISTS watches_brand_idx ON public.watches (brand);
CREATE INDEX IF NOT EXISTS watches_category_idx ON public.watches (category);

-- Trigram index on name for fuzzy ILIKE search
CREATE INDEX IF NOT EXISTS watches_name_trgm_idx ON public.watches USING gin (name gin_trgm_ops);

-- GIN index on alt_names array for lookup checks
CREATE INDEX IF NOT EXISTS watches_alt_names_idx ON public.watches USING gin (alt_names);

-- ============================================================
-- TRIGGER: auto-update updated_at on UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS watches_set_updated_at ON public.watches;
CREATE TRIGGER watches_set_updated_at
  BEFORE UPDATE ON public.watches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY: public read, no public write
-- ============================================================
ALTER TABLE public.watches ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can SELECT
DROP POLICY IF EXISTS "watches_public_read" ON public.watches;
CREATE POLICY "watches_public_read"
  ON public.watches
  FOR SELECT
  TO anon, authenticated
  USING (true);
