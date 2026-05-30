-- ============================================================
-- Re-engagement cron — server-side push trigger detection.
-- ============================================================
-- Adds pg_cron jobs that scan funnel_events + user_profile and call
-- the `send-re-engagement` Edge Function for cohorts matching a
-- campaign rule. Three campaigns, all configured here:
--
--   1. cart_abandoned         — paywall_dismissed without checkout
--                                in last 2 hours (every 15 min)
--   2. free_limit_approaching — scan_quota_approaching fired but
--                                no checkout_started in 24 hours (hourly)
--   3. dormant_7d             — no app_opened in 7 days (daily)
--
-- All jobs call the Edge Function via pg_net (HTTP from Postgres).
-- pg_net + pg_cron must both be enabled. If unavailable the migration
-- still completes — sender code lives in the Edge Function and can
-- be invoked manually via REST.
--
-- Apply via Supabase Dashboard → SQL Editor → paste & run.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Enable required extensions ────────────────────────────
-- pg_cron should already be enabled from migration 0005. pg_net is
-- the Postgres-side HTTP client (Supabase ships it; needs explicit
-- enable per project).

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron unavailable — re-engagement cron will not auto-fire.';
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net unavailable — pg_cron jobs cannot call the Edge Function.';
  END;
END;
$$;


-- ── 2. Helper: dispatch an array of cohort_hashes to the function ─
-- Wraps the pg_net.http_post call.
--
-- Secrets (Supabase URL + service-role JWT) are read from Supabase
-- Vault, which uses pgsodium for encrypted-at-rest secret storage.
-- ALTER DATABASE SET would also work on plain Postgres but Supabase
-- restricts that to true superusers — the `postgres` role in the SQL
-- Editor returns 42501 (permission denied). Vault is the idiomatic
-- workaround and is enabled by default on every Supabase project.
--
-- ONE-TIME SETUP (after applying this migration):
--   SELECT vault.create_secret(
--     'https://<your-ref>.supabase.co', 'supabase_url'
--   );
--   SELECT vault.create_secret(
--     '<your-service-role-jwt>',        'service_role_jwt'
--   );
--
-- The decrypted JWT NEVER leaves the database — only pg_net reads it
-- to authenticate the inbound Edge Function call.

CREATE OR REPLACE FUNCTION public.dispatch_reengagement(
  campaign_name TEXT,
  cohort_hashes TEXT[]
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id BIGINT;
  url        TEXT;
  jwt        TEXT;
BEGIN
  IF array_length(cohort_hashes, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Read secrets from Supabase Vault. The decrypted view materializes
  -- per-call (decryption happens in pgsodium), so the plaintext never
  -- persists outside this function invocation.
  BEGIN
    SELECT decrypted_secret INTO url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url' LIMIT 1;

    SELECT decrypted_secret INTO jwt
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_jwt' LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Vault read failed (%): skipping dispatch.', SQLERRM;
      RETURN NULL;
  END;

  IF url IS NULL OR jwt IS NULL THEN
    RAISE NOTICE 'Vault secrets supabase_url / service_role_jwt not set — skipping dispatch.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := url || '/functions/v1/send-re-engagement',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || jwt
    ),
    body := jsonb_build_object(
      'campaign',       campaign_name,
      'cohort_hashes',  to_jsonb(cohort_hashes)
    )
  ) INTO request_id;

  RETURN request_id;
END;
$$;


-- ── 3. Cart-abandonment detector ────────────────────────────
-- Fires every 15 minutes. Finds cohorts that:
--   • Saw a paywall in last 2 hours
--   • Did NOT start checkout afterward
--   • Have NOT already been sent a cart_abandoned push in last 24h
--     (de-dup so we don't spam)

CREATE OR REPLACE FUNCTION public.detect_cart_abandoned()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  targets TEXT[];
BEGIN
  SELECT array_agg(DISTINCT pv.cohort_hash)
  INTO targets
  FROM public.funnel_events pv
  WHERE pv.event_type = 'paywall_viewed'
    AND pv.created_at BETWEEN now() - INTERVAL '2 hours' AND now() - INTERVAL '15 minutes'
    -- No checkout for THIS cohort after the paywall view
    AND NOT EXISTS (
      SELECT 1 FROM public.funnel_events c
      WHERE c.cohort_hash = pv.cohort_hash
        AND c.event_type = 'checkout_started'
        AND c.created_at >= pv.created_at
    )
    -- And not already nudged in last 24h
    AND NOT EXISTS (
      SELECT 1 FROM public.funnel_events r
      WHERE r.cohort_hash = pv.cohort_hash
        AND r.event_type = 're_engagement_sent'
        AND r.payload->>'campaign' = 'cart_abandoned'
        AND r.created_at > now() - INTERVAL '24 hours'
    );

  RETURN public.dispatch_reengagement('cart_abandoned', COALESCE(targets, ARRAY[]::TEXT[]));
END;
$$;


-- ── 4. Free-limit approaching detector ──────────────────────
-- Fires hourly. Catches users who hit the 80% warning but haven't
-- upgraded after 24 hours — softer nudge than the hard "out of
-- scans" wall.

CREATE OR REPLACE FUNCTION public.detect_free_limit_approaching()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  targets TEXT[];
BEGIN
  SELECT array_agg(DISTINCT a.cohort_hash)
  INTO targets
  FROM public.funnel_events a
  WHERE a.event_type = 'scan_quota_approaching'
    AND a.created_at BETWEEN now() - INTERVAL '48 hours' AND now() - INTERVAL '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.funnel_events c
      WHERE c.cohort_hash = a.cohort_hash
        AND c.event_type = 'checkout_started'
        AND c.created_at >= a.created_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.funnel_events r
      WHERE r.cohort_hash = a.cohort_hash
        AND r.event_type = 're_engagement_sent'
        AND r.payload->>'campaign' = 'free_limit_approaching'
        AND r.created_at > now() - INTERVAL '72 hours'
    );

  RETURN public.dispatch_reengagement('free_limit_approaching', COALESCE(targets, ARRAY[]::TEXT[]));
END;
$$;


-- ── 5. Dormant detector (7-day churn risk) ──────────────────
-- Daily job. Finds users who haven't opened the app in 7 days but
-- were active in last 30. Sends a soft "your collection has updates"
-- push to bring them back.

CREATE OR REPLACE FUNCTION public.detect_dormant_users()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  targets TEXT[];
BEGIN
  SELECT array_agg(DISTINCT up.cohort_hash)
  INTO targets
  FROM public.user_profile up
  WHERE up.last_active_at BETWEEN now() - INTERVAL '30 days' AND now() - INTERVAL '7 days'
    AND up.push_token IS NOT NULL  -- only push to users who opted in
    AND NOT EXISTS (
      SELECT 1 FROM public.funnel_events r
      WHERE r.cohort_hash = up.cohort_hash
        AND r.event_type = 're_engagement_sent'
        AND r.payload->>'campaign' = 'dormant_7d'
        AND r.created_at > now() - INTERVAL '14 days'  -- max 1 dormant push per 2 weeks
    );

  RETURN public.dispatch_reengagement('dormant_7d', COALESCE(targets, ARRAY[]::TEXT[]));
END;
$$;


-- ── 6. Schedule via pg_cron ──────────────────────────────────
-- All three jobs share the same dispatch helper so the SQL changes
-- live in one place. Idempotent — drops existing schedule first.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping schedule. Run extensions first.';
    RETURN;
  END IF;

  -- Cart abandonment — every 15 min
  BEGIN PERFORM cron.unschedule('reengage-cart-abandoned'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'reengage-cart-abandoned',
    '*/15 * * * *',
    $cron$SELECT public.detect_cart_abandoned();$cron$
  );

  -- Free limit approaching — hourly
  BEGIN PERFORM cron.unschedule('reengage-free-limit'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'reengage-free-limit',
    '0 * * * *',
    $cron$SELECT public.detect_free_limit_approaching();$cron$
  );

  -- Dormant — once per day at 10:00 ICT (03:00 UTC). Bangkok mid-morning
  -- is high open-rate window for retention pushes (commute → desk).
  BEGIN PERFORM cron.unschedule('reengage-dormant'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'reengage-dormant',
    '0 3 * * *',  -- 03:00 UTC = 10:00 ICT
    $cron$SELECT public.detect_dormant_users();$cron$
  );

  RAISE NOTICE 'Re-engagement cron jobs scheduled.';
END;
$$;


-- ── 7. Sanity verification (informational) ────────────────────
-- After applying + setting GUCs, check:
--
-- SELECT jobname, schedule, active FROM cron.job
-- WHERE jobname LIKE 'reengage-%';
--
-- Manual fire (test the pipeline without waiting for cron):
-- SELECT public.detect_cart_abandoned();
-- SELECT public.detect_free_limit_approaching();
-- SELECT public.detect_dormant_users();
--
-- Or invoke Edge Function directly:
-- SELECT public.dispatch_reengagement(
--   'cart_abandoned',
--   ARRAY['<a real cohort_hash from funnel_events>']
-- );
--
-- Inspect pg_net responses:
-- SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 5;
