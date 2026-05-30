-- ============================================================
-- Replicate Keep-Warm Cron — defense-in-depth backup to GH Actions
-- ============================================================
-- Background:
--   .github/workflows/replicate-keepwarm.yml pings the embed-image
--   Edge Function every 5 minutes so the Replicate DINOv3 endpoint
--   stays hot. Without this, after ~10 min of idle the Replicate
--   model cold-starts and the next embed call takes 30-90s.
--
--   GitHub Actions schedules can SILENTLY stop firing for several
--   reasons:
--     • Public-repo workflows auto-disable after 60 days of no commits
--       to the workflow file itself (an Anthropic-known github quirk)
--     • Secret rotation: if EXPO_PUBLIC_SUPABASE_URL / ANON_KEY /
--       EMBED_FUNCTION_SECRET aren't set in repo Settings → Secrets,
--       curl returns 401/403 and runs all fail
--     • Concurrency limits / scheduled-run skips during heavy load
--
--   The May 2026 scan log showed a 55,942ms Replicate prewarm,
--   confirming the GH Actions ping had been silent for ≥10 minutes.
--
-- Fix: add a pg_cron job that also pings embed-image every 5 minutes
-- from inside Postgres itself. pg_net handles the HTTP. This runs
-- independently of GH Actions — even if Actions silently dies, the
-- DB heartbeat keeps Replicate warm.
--
-- Schedule cadence: 7 min (vs GH Actions' 5 min) so the two pings
-- interleave nicely — at most ~3.5 min between any two pings, well
-- under the ~10 min cold-start threshold.
--
-- Apply via Supabase Dashboard → SQL Editor → paste & run.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Required extensions ──────────────────────────────────
-- pg_cron + pg_net should already be enabled by migration 0006.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available — keep-warm cron will not auto-fire.';
  END;
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net not available — pg_cron jobs cannot make HTTP calls.';
  END;
END;
$$;


-- ── 2. Helper: ping embed-image to keep Replicate warm ─────
-- Uses the same 32x32 white JPG base64 payload as the GH Actions
-- workflow. Calls Supabase's own Edge Function via pg_net.
--
-- Secrets pattern matches migration 0006: read from Supabase Vault
-- so the service-role JWT never leaves the database. ONE-TIME setup
-- (already done if migration 0006 was applied):
--   SELECT vault.create_secret('https://<ref>.supabase.co', 'supabase_url');
--   SELECT vault.create_secret('<service-role-jwt>',         'service_role_jwt');

CREATE OR REPLACE FUNCTION public.ping_replicate_keepwarm()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id BIGINT;
  url        TEXT;
  jwt        TEXT;
  -- 32x32 white JPG, base64-encoded. Same payload the GH workflow uses.
  -- Tiny enough that bandwidth is negligible; large enough that the
  -- model's normalize transform doesn't trip on a single-channel pixel.
  dummy_b64  TEXT := '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7LooooAKKKKACiiigAooooA//2Q==';
BEGIN
  -- Read secrets from Vault. Decryption happens per-call inside pgsodium;
  -- plaintext never persists outside this function invocation.
  BEGIN
    SELECT decrypted_secret INTO url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url' LIMIT 1;

    SELECT decrypted_secret INTO jwt
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_jwt' LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Vault read failed (%): skipping keep-warm ping.', SQLERRM;
      RETURN NULL;
  END;

  IF url IS NULL OR jwt IS NULL THEN
    RAISE NOTICE 'Vault secrets not set — skipping keep-warm ping. Set via vault.create_secret().';
    RETURN NULL;
  END IF;

  -- Fire-and-forget HTTP POST. We do NOT wait for the response — the
  -- whole point is to wake Replicate, not to verify the embed value.
  -- pg_net's _http_response table records the outcome async; query it
  -- with: SELECT id, status_code FROM net._http_response ORDER BY id DESC LIMIT 10;
  SELECT net.http_post(
    url := url || '/functions/v1/embed-image',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'Authorization',   'Bearer ' || jwt
    ),
    -- warmOnly => embed-image does a fire-and-forget Replicate create (no
    -- Prefer:wait) and returns in <1s, so the model boots to completion
    -- server-side and the ping reliably records a 200 instead of a None
    -- timeout. (Previously this reused the synchronous embed path, which on a
    -- cold start exceeded the edge cap and returned no usable response.)
    body := jsonb_build_object('image', 'data:image/jpeg;base64,' || dummy_b64, 'warmOnly', true),
    timeout_milliseconds := 20000  -- create returns in <1s; 20s is ample headroom
  ) INTO request_id;

  RETURN request_id;
END;
$$;


-- ── 3. Schedule via pg_cron ─────────────────────────────────
-- Every 5 minutes. This is the SOLE keep-warm channel now (GitHub Actions and
-- a cron-job.org job were both retired 2026-05-30). Tightened */7 → */5 after
-- observing a 60s cold-start: warmOnly pings only TRIGGER a boot (they return
-- 200 immediately, "succeeded" ≠ model warm), and Replicate scales the instance
-- down in under 7 min, so a */7 cadence left recurring cold gaps.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping schedule.';
    RETURN;
  END IF;

  -- Drop any previous schedule with the same name (idempotent).
  BEGIN PERFORM cron.unschedule('replicate-keepwarm'); EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Every 5 minutes, all day. ~288 pings/day = ~$0.32/day Replicate cost
  -- (~฿320/month) — worth it for consistent <3s scans with no cold gaps.
  PERFORM cron.schedule(
    'replicate-keepwarm',
    '*/5 * * * *',
    $cron$SELECT public.ping_replicate_keepwarm();$cron$
  );

  RAISE NOTICE 'replicate-keepwarm scheduled (every 5 min).';
END;
$$;


-- ── 4. Sanity verification (informational) ─────────────────────
-- After applying:
--
-- 1) Confirm the job is scheduled and active:
-- SELECT jobid, schedule, command, active FROM cron.job WHERE jobname = 'replicate-keepwarm';
--
-- 2) Manually fire once to test the pipeline:
-- SELECT public.ping_replicate_keepwarm();
--
-- 3) Inspect the most recent pg_net responses (status_code 200 = warm hit,
--    500 with "starting" body = cold-start triggered = ALSO success):
-- SELECT id, status_code, content::text
-- FROM net._http_response
-- WHERE created > now() - INTERVAL '30 minutes'
-- ORDER BY id DESC LIMIT 10;
--
-- 4) Confirm cron actually ran (cron.job_run_details only populated
--    on free tier > Sep 2024, but check anyway):
-- SELECT jobid, runid, job_pid, status, return_message, start_time
-- FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'replicate-keepwarm')
-- ORDER BY start_time DESC LIMIT 10;
