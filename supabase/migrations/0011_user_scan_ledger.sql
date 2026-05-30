-- 0011_user_scan_ledger.sql
-- Server-side per-USER scan ledger (audit fix C1/C3/C5 — the authoritative
-- scan count, keyed on auth.users.id instead of a resettable client value).
--
-- STAGE 1 = SHADOW. The edge functions RECORD scans here and log the running
-- count, but do NOT block yet. Once the shadow logs confirm real logged-in users
-- are tracked correctly, Stage 2 flips the edge function to enforce (reject the
-- AI call when over the tier cap) — at which point a reinstall / clear-data can
-- no longer reset the free allotment, because the count lives here under the
-- user's auth id.
--
-- Only `service_role` (the edge functions) ever touches this. RLS is on with NO
-- policies → default-deny for anon/authenticated; service_role bypasses RLS.

CREATE TABLE IF NOT EXISTS public.user_scan_ledger (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_key    text        NOT NULL,                 -- 'YYYY-MM' (calendar month bucket)
  scans_used    int         NOT NULL DEFAULT 0,
  first_scan_at timestamptz NOT NULL DEFAULT now(),
  last_scan_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_key)
);

ALTER TABLE public.user_scan_ledger ENABLE ROW LEVEL SECURITY;
-- No policies on purpose → anon/authenticated are default-denied. Lock the GRANTs too.
REVOKE ALL ON public.user_scan_ledger FROM anon, authenticated;

-- record_user_scan: atomically +1 the user's count for the given month bucket,
-- and return both the month count and the lifetime total (sum across all
-- buckets). Stage 2 will pass the tier cap and branch on the result; Stage 1
-- just reads the numbers for the shadow log. service_role only.
CREATE OR REPLACE FUNCTION public.record_user_scan(
  p_user_id uuid,
  p_period  text
)
RETURNS TABLE (period_used int, lifetime_used int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period   int;
  v_lifetime int;
BEGIN
  INSERT INTO public.user_scan_ledger (user_id, period_key, scans_used)
  VALUES (p_user_id, p_period, 1)
  ON CONFLICT (user_id, period_key)
  DO UPDATE SET scans_used   = public.user_scan_ledger.scans_used + 1,
                last_scan_at = now()
  RETURNING public.user_scan_ledger.scans_used INTO v_period;

  SELECT COALESCE(SUM(scans_used), 0)
    INTO v_lifetime
    FROM public.user_scan_ledger
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_period, v_lifetime;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_scan(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_scan(uuid, text) TO service_role;
