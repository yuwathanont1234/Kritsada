-- 0017_cost_alert_cron.sql
-- Hourly spend-anomaly watchdog: pg_cron → cost-alert edge function.
--
-- WHY: the 2026-06-10 audit found a runaway-spend would be SILENT — the old
-- cost "circuit breaker" was fed by client-side cost_events (a direct caller
-- simply doesn't send them) and no email/LINE sender was ever wired. The
-- cost-alert function instead reads the trustworthy SERVER-side counters
-- (global_scan_daily, edge_quota incl. the global:billable-calls ceiling)
-- and pushes to ALERT_WEBHOOK_URL when a metric crosses 75% / 100% of cap.
--
-- Dedupe state lives here: one row per (day, metric, level) — the hourly
-- cron fires the webhook at most once per threshold per day.
--
-- Vault prerequisites (same as 0006/0007, already set if those ran):
--   SELECT vault.create_secret('https://<ref>.supabase.co', 'supabase_url');
--   SELECT vault.create_secret('<service-role-jwt>',         'service_role_jwt');
-- Edge secret for the push destination:
--   supabase secrets set ALERT_WEBHOOK_URL=<Discord/Slack/bridge webhook URL>

-- ── 1. Dedupe table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cost_alert_log (
  day     date NOT NULL,
  metric  text NOT NULL,
  level   text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, metric, level)
);
ALTER TABLE public.cost_alert_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cost_alert_log FROM anon, authenticated;

-- ── 2. Caller function (pg_net POST with the service JWT) ───────
CREATE OR REPLACE FUNCTION public.run_cost_alert_check()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  request_id BIGINT;
  url        TEXT;
  jwt        TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url' LIMIT 1;

    SELECT decrypted_secret INTO jwt
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_jwt' LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Vault read failed (%): skipping cost-alert check.', SQLERRM;
      RETURN NULL;
  END;

  IF url IS NULL OR jwt IS NULL THEN
    RAISE NOTICE 'Vault secrets not set — skipping cost-alert check.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := url || '/functions/v1/cost-alert',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || jwt
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_cost_alert_check() FROM public, anon, authenticated;

-- ── 3. Schedule hourly (minute 7, offset from the keep-warm job) ─
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping cost-alert schedule.';
    RETURN;
  END IF;

  BEGIN PERFORM cron.unschedule('cost-alert-hourly'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule(
    'cost-alert-hourly',
    '7 * * * *',
    $cron$SELECT public.run_cost_alert_check();$cron$
  );

  RAISE NOTICE 'cost-alert-hourly scheduled (minute 7 of every hour).';
END;
$$;

-- ── 4. Verification ─────────────────────────────────────────────
-- SELECT jobid, schedule, command, active FROM cron.job WHERE jobname = 'cost-alert-hourly';
-- SELECT public.run_cost_alert_check();  -- manual fire
-- SELECT id, status_code, content::text FROM net._http_response
--   WHERE created > now() - INTERVAL '10 minutes' ORDER BY id DESC LIMIT 5;
