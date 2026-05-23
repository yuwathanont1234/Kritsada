-- =========================================================================
-- Anonymous Scan Events & Tester Telemetry — Data Flywheel
-- =========================================================================
-- Run once in Supabase SQL Editor.
-- Idempotent: safe to re-run
-- =========================================================================

-- ============================================================
-- TABLE: scan_events
--   Stores scan statistics, model choices, token usage, and latencies.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scan_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_hash  TEXT NOT NULL,
  
  -- Watch identification
  watch_brand  TEXT,
  watch_reference TEXT,
  watch_name   TEXT,
  confidence   INTEGER,
  identified   BOOLEAN NOT NULL DEFAULT false,

  -- Visual RAG mismatches
  visual_rag_top_id TEXT,
  visual_rag_top_sim NUMERIC(5,4),
  visual_rag_mismatch BOOLEAN NOT NULL DEFAULT false,

  -- Telemetry & Cost
  tier         TEXT CHECK (tier IN ('free', 'standard', 'pro', 'premium')),
  event_type   TEXT,
  path_taken   TEXT,
  cost_usd     NUMERIC(8,4) NOT NULL DEFAULT 0.0000,
  latency_ms   INTEGER,
  model_used   TEXT,
  prompt_tokens INTEGER,
  output_tokens INTEGER,
  payload      JSONB,
  
  -- System
  app_version  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_events_created_at ON public.scan_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_events_watch ON public.scan_events(watch_brand, watch_reference) WHERE identified = true;
CREATE INDEX IF NOT EXISTS idx_scan_events_low_confidence ON public.scan_events(watch_reference, created_at DESC) WHERE confidence < 60;

-- ============================================================
-- TABLE: tester_events
--   Tester telemetry tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tester_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  platform     TEXT NOT NULL,
  app_version  TEXT NOT NULL,
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tester_events_device ON public.tester_events(device_id);

-- ============================================================
-- TABLE: tester_feedback
--   In-app tester feedback submission
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tester_feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    TEXT NOT NULL,
  message      TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN ('bug', 'ux', 'feature', 'general')),
  platform     TEXT NOT NULL,
  app_version  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- MATERIALIZED VIEW: trending_watches_7d
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.trending_watches_7d AS
SELECT
  watch_brand,
  watch_reference,
  watch_name,
  COUNT(*) AS scan_count,
  COUNT(DISTINCT cohort_hash) AS unique_cohorts,
  AVG(confidence)::INTEGER AS avg_confidence,
  MAX(created_at) AS last_seen_at
FROM public.scan_events
WHERE created_at > now() - interval '7 days'
  AND identified = true
  AND watch_brand IS NOT NULL
  AND watch_brand <> ''
GROUP BY watch_brand, watch_reference, watch_name
HAVING COUNT(DISTINCT cohort_hash) >= 3
ORDER BY scan_count DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_watches_7d_ref ON public.trending_watches_7d (watch_brand, watch_reference);

-- ============================================================
-- ROW LEVEL SECURITY: Insert allowed for public/anon keys
-- ============================================================
ALTER TABLE public.scan_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tester_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tester_feedback ENABLE ROW LEVEL SECURITY;

-- Insert Policies
DROP POLICY IF EXISTS "scan_events_insert_anon" ON public.scan_events;
CREATE POLICY "scan_events_insert_anon" ON public.scan_events FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "tester_events_insert_anon" ON public.tester_events;
CREATE POLICY "tester_events_insert_anon" ON public.tester_events FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "tester_feedback_insert_anon" ON public.tester_feedback;
CREATE POLICY "tester_feedback_insert_anon" ON public.tester_feedback FOR INSERT WITH CHECK (true);

-- No public select allowed directly on scan_events, tester_events, or feedback.
-- Keeps metrics and telemetry private.

-- ============================================================
-- FUNCTION: delete_my_scan_events
--   Right to erasure (PDPA / GDPR compliant).
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_my_scan_events(my_cohort_hash TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.scan_events
  WHERE cohort_hash = my_cohort_hash;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_scan_events(TEXT) TO anon, authenticated;
