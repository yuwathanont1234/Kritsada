-- Cost Circuit Breaker (v5 — solo founder safety net)
-- ============================================================================
-- Tracks daily AI spend across all features in USD. If we hit DAILY_BUDGET_USD
-- (default $60.00/day = ~฿2,000/day = ~$1,800/mo) we pause Free-tier AI calls and send
-- the founder an alert. Paid tiers keep working — they paid for it.
--
-- Why this exists: viral spike + abuse + Free-tier overuse can compound
-- into a 100x cost overnight. With $0.01/scan and a 10K-scan abuser, you
-- bleed $100 in one bad day. Without a breaker, you find out only when
-- the credit card alert hits — too late.
--
-- Granularity: daily counter, reset at midnight Thailand time. We track
-- each cost-incurring call (scan / Q&A / heatmap / authenticity / etc.)
-- in cost_events for forensics.

-- Per-event cost log (forensics / debugging)
CREATE TABLE IF NOT EXISTS public.cost_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,      -- 'scan' | 'ai_qa' | 'heatmap' | 'authenticity' | 'deep_search' | 'bg_remove' | 'embedding'
  cost_usd NUMERIC(10, 4) NOT NULL,
  tier TEXT,                     -- 'free' | 'standard' | 'pro' | 'premium'
  cohort_hash TEXT,              -- if user opted into data sharing (matches scan_events.cohort_hash)
  cache_hit BOOLEAN DEFAULT FALSE, -- TRUE if served from cache (cost should be 0)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_events_created
  ON public.cost_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_type
  ON public.cost_events(event_type, created_at DESC);

-- Daily budget config (single row table — easy to edit via dashboard)
CREATE TABLE IF NOT EXISTS public.cost_budget_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforce single row
  daily_budget_usd NUMERIC(10, 2) NOT NULL DEFAULT 60.00,
  free_tier_paused BOOLEAN NOT NULL DEFAULT FALSE,
  free_tier_paused_at TIMESTAMPTZ,
  free_tier_paused_reason TEXT,
  alert_email TEXT,
  alert_line_token TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.cost_budget_config (id, daily_budget_usd)
  VALUES (1, 60.00)
  ON CONFLICT (id) DO NOTHING;

-- Helper: get today's spend (Thailand timezone / standard Asia focus). Used by both client and
-- backend logic to decide whether to gate.
CREATE OR REPLACE FUNCTION public.cost_today_usd()
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
    FROM public.cost_events
   WHERE created_at >= (
     -- Today's midnight in Thailand (UTC+7)
     DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Bangkok')
       AT TIME ZONE 'Asia/Bangkok'
   );
$$ LANGUAGE SQL STABLE;

-- Helper: should we gate Free-tier AI calls right now?
CREATE OR REPLACE FUNCTION public.cost_should_gate_free()
RETURNS BOOLEAN AS $$
DECLARE
  v_paused BOOLEAN;
  v_budget NUMERIC;
  v_spent NUMERIC;
BEGIN
  SELECT free_tier_paused, daily_budget_usd
    INTO v_paused, v_budget
    FROM public.cost_budget_config WHERE id = 1;

  -- Manually paused by admin → gate immediately
  IF v_paused THEN
    RETURN TRUE;
  END IF;

  -- Auto-gate if we've burnt through 80% of daily budget
  v_spent := public.cost_today_usd();
  RETURN v_spent >= v_budget * 0.80;
END;
$$ LANGUAGE plpgsql STABLE;

-- Auto-gate trigger: when a cost_event pushes us past the budget, flip
-- the pause flag. (Independent of the manual flag so both can coexist.)
CREATE OR REPLACE FUNCTION public.cost_check_breaker()
RETURNS TRIGGER AS $$
DECLARE
  v_budget NUMERIC;
  v_spent NUMERIC;
BEGIN
  SELECT daily_budget_usd INTO v_budget FROM public.cost_budget_config WHERE id = 1;
  v_spent := public.cost_today_usd();

  IF v_spent >= v_budget THEN
    UPDATE public.cost_budget_config
       SET free_tier_paused = TRUE,
           free_tier_paused_at = NOW(),
           free_tier_paused_reason = 'Auto: hit daily budget $' || v_budget,
           updated_at = NOW()
     WHERE id = 1
       AND free_tier_paused = FALSE; -- only flip once per breach
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER cost_check_breaker_trigger
  AFTER INSERT ON public.cost_events
  FOR EACH ROW
  EXECUTE FUNCTION public.cost_check_breaker();

-- Stats view — daily summary for admin dashboard
CREATE OR REPLACE VIEW public.cost_daily_summary AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Bangkok') AS date,
  event_type,
  COUNT(*) AS event_count,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(*) FILTER (WHERE cache_hit) AS cache_hits,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cache_hit) / NULLIF(COUNT(*), 0), 1
  ) AS cache_hit_pct
FROM public.cost_events
GROUP BY DATE(created_at AT TIME ZONE 'Asia/Bangkok'), event_type
ORDER BY date DESC, event_type;

-- RLS: anonymous client can INSERT cost_events (we trust client for this
-- because it's append-only telemetry — no read of others' data). Reads
-- are admin-only via service_role.
ALTER TABLE public.cost_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can log cost events" ON public.cost_events;
CREATE POLICY "Anyone can log cost events"
  ON public.cost_events FOR INSERT
  WITH CHECK (TRUE);

-- Config table is read-only for anonymous (so client can check
-- free_tier_paused), no inserts/updates from anon.
ALTER TABLE public.cost_budget_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read budget config" ON public.cost_budget_config;
CREATE POLICY "Anyone can read budget config"
  ON public.cost_budget_config FOR SELECT
  USING (TRUE);
