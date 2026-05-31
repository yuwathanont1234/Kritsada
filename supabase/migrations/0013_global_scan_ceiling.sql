-- 0013_global_scan_ceiling.sql
-- Catastrophic-cost backstop (audit "global daily cost ceiling"): a GLOBAL,
-- server-side daily scan counter the edge function increments on every scan.
--
-- Why a new server-side counter instead of the existing cost_events breaker:
-- cost_events are logged by the CLIENT (logCostEvent), so a tampered client can
-- simply not log them → the existing breaker never trips. This counter lives in
-- the edge function (service_role), so it counts real scans regardless of what
-- the client reports — a trustworthy ceiling.
--
-- The edge flips shadow↔enforce via GLOBAL_CEILING_ENFORCE; cap via
-- GLOBAL_DAILY_SCAN_CAP (default 2000/day ≈ ฿5k worst case — only a runaway /
-- abuse spike reaches it, so it never blocks legit traffic). service_role only.

CREATE TABLE IF NOT EXISTS public.global_scan_daily (
  day          date        NOT NULL PRIMARY KEY,   -- UTC day bucket
  scans_used   int         NOT NULL DEFAULT 0,
  last_scan_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_scan_daily ENABLE ROW LEVEL SECURITY;
-- No policies → anon/authenticated default-denied; service_role bypasses RLS.
REVOKE ALL ON public.global_scan_daily FROM anon, authenticated;

-- consume_global_scan: same shadow/enforce semantics as consume_user_scan.
--   enforce=false → always +1, allowed=true (shadow; caller logs would-block).
--   enforce=true  → if already at/over cap, do NOT increment, allowed=false.
CREATE OR REPLACE FUNCTION public.consume_global_scan(
  p_day     date,
  p_cap     int,
  p_enforce boolean
)
RETURNS TABLE (allowed boolean, scans_used int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current int;
  v_used    int;
BEGIN
  SELECT scans_used INTO v_current
    FROM public.global_scan_daily WHERE day = p_day;
  v_current := COALESCE(v_current, 0);

  IF p_enforce AND v_current >= p_cap THEN
    RETURN QUERY SELECT false, v_current;
    RETURN;
  END IF;

  INSERT INTO public.global_scan_daily (day, scans_used)
  VALUES (p_day, 1)
  ON CONFLICT (day)
  DO UPDATE SET scans_used   = public.global_scan_daily.scans_used + 1,
                last_scan_at = now()
  RETURNING public.global_scan_daily.scans_used INTO v_used;

  RETURN QUERY SELECT true, v_used;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_global_scan(date, int, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_global_scan(date, int, boolean) TO service_role;
