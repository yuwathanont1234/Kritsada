-- 0012_consume_user_scan.sql
-- Stage 2: an ENFORCE-ready version of record_user_scan (0011). Adds a per-user
-- monthly "backstop" cap. The edge function flips shadow↔enforce via an env flag
-- (SCAN_LEDGER_ENFORCE) — no code change needed to go live.
--
-- Behaviour:
--   p_enforce = false (SHADOW) → always +1, returns allowed=true + the counts.
--       The caller logs "would block" if period_used > cap, but never blocks.
--   p_enforce = true (ENFORCE) → if the user is ALREADY at/over the cap, do NOT
--       increment and return allowed=false (so a blocked scan isn't counted);
--       otherwise +1 and return allowed=true.
--
-- The cap is a generous backstop (default 150/month, set in the edge env) — well
-- above the highest legit tier (premium = 100/mo) so it never blocks a real
-- user, but it bounds a single abused account instead of leaving it unlimited.
-- service_role only.

CREATE OR REPLACE FUNCTION public.consume_user_scan(
  p_user_id uuid,
  p_period  text,
  p_cap     int,
  p_enforce boolean
)
RETURNS TABLE (allowed boolean, period_used int, lifetime_used int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current  int;
  v_period   int;
  v_lifetime int;
BEGIN
  SELECT scans_used INTO v_current
    FROM public.user_scan_ledger
   WHERE user_id = p_user_id AND period_key = p_period;
  v_current := COALESCE(v_current, 0);

  -- ENFORCE + already at/over cap → block without counting.
  IF p_enforce AND v_current >= p_cap THEN
    SELECT COALESCE(SUM(scans_used), 0) INTO v_lifetime
      FROM public.user_scan_ledger WHERE user_id = p_user_id;
    RETURN QUERY SELECT false, v_current, v_lifetime;
    RETURN;
  END IF;

  INSERT INTO public.user_scan_ledger (user_id, period_key, scans_used)
  VALUES (p_user_id, p_period, 1)
  ON CONFLICT (user_id, period_key)
  DO UPDATE SET scans_used   = public.user_scan_ledger.scans_used + 1,
                last_scan_at = now()
  RETURNING public.user_scan_ledger.scans_used INTO v_period;

  SELECT COALESCE(SUM(scans_used), 0) INTO v_lifetime
    FROM public.user_scan_ledger WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, v_period, v_lifetime;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_user_scan(uuid, text, int, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_user_scan(uuid, text, int, boolean) TO service_role;
