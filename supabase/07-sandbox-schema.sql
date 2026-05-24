-- ============================================================
-- Sandbox — Isolated reference tables for unverified watches
-- ============================================================
-- Run this in your Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sandbox_watches (
  id              TEXT PRIMARY KEY,
  brand           TEXT NOT NULL,
  model           TEXT NOT NULL,
  name            TEXT NOT NULL,
  price_thb       BIGINT,
  local_path      TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on brand for high-performance brand-sensitive RAG matches
CREATE INDEX IF NOT EXISTS idx_sandbox_watches_brand ON public.sandbox_watches(brand);

-- Enable Row Level Security (RLS)
ALTER TABLE public.sandbox_watches ENABLE ROW LEVEL SECURITY;

-- Allow public read access to all users (anon + authenticated)
DROP POLICY IF EXISTS "sandbox_watches_public_read" ON public.sandbox_watches;
CREATE POLICY "sandbox_watches_public_read"
  ON public.sandbox_watches
  FOR SELECT
  TO anon, authenticated
  USING (true);
