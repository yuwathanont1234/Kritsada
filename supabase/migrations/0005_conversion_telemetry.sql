-- ============================================================
-- Conversion Telemetry — user_profile + funnel_events
-- ============================================================
-- Adds two tables to support data-driven conversion-rate
-- optimization for the mobile app:
--
--   1. user_profile — cohort-keyed anonymous segmentation
--      (role, preferred_brand, language, install_source, etc.)
--      Used to render segment-aware paywall copy in Phase 2.
--
--   2. funnel_events — conversion funnel breadcrumbs
--      (paywall_viewed, checkout_started, subscription_completed,
--       scan_quota_approaching/exhausted, onboarding_*, etc.)
--      Mirrors the existing scan_events / cost_events pattern.
--
-- Privacy posture:
--   • Both tables are RLS default-deny for anon SELECT.
--   • anon INSERT/UPSERT allowed (clients writing their own
--     cohort-scoped data — same model as scan_events).
--   • service_role bypasses RLS for server-side analytics jobs.
--   • cohortHash remains the only identifier — no PII.
--
-- Apply via Supabase Dashboard → SQL Editor → paste & run.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. user_profile: anonymous cohort-keyed segment data ─────
-- Primary key = cohortHash (32-char random per install, defined
-- in src/lib/dataConsent.ts). NOT tied to auth.users — purely
-- anonymous so PDPA "anonymous data" classification applies.

CREATE TABLE IF NOT EXISTS public.user_profile (
  cohort_hash       TEXT PRIMARY KEY,

  -- Segmentation (set during Onboarding quiz)
  role              TEXT,            -- 'collector' | 'dealer' | 'first_time'
  preferred_brand   TEXT,            -- 'rolex' | 'patek' | 'ap' | 'omega' | 'other'
  watch_count_est   TEXT,            -- '1-3' | '4-10' | '10+' (Phase 2)
  budget_tier       TEXT,            -- derived/optional 'entry' | 'mid' | 'luxury'

  -- Device + locale (lightweight, no GPS)
  language          TEXT NOT NULL DEFAULT 'th',
  country           TEXT,            -- city-level only via IP-geolocation, never exact
  app_version       TEXT,

  -- Acquisition attribution (Phase 2 — UTM / Install Referrer)
  install_source    TEXT,            -- 'organic' | 'fb_ads' | 'tiktok' | 'line_oa' | 'referral'

  -- Contact channels (Phase 3 — re-engagement)
  phone_verified    BOOLEAN DEFAULT false,
  phone_e164        TEXT,            -- only set after explicit OTP consent
  push_token        TEXT,            -- expo push token
  line_user_id      TEXT,            -- LINE OA binding

  -- Lifecycle
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  onboarding_done   BOOLEAN NOT NULL DEFAULT false,

  -- Audit
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for segment queries + churn analysis
CREATE INDEX IF NOT EXISTS user_profile_role_idx
  ON public.user_profile (role)
  WHERE role IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_profile_brand_idx
  ON public.user_profile (preferred_brand)
  WHERE preferred_brand IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_profile_last_active_idx
  ON public.user_profile (last_active_at DESC);

CREATE INDEX IF NOT EXISTS user_profile_install_source_idx
  ON public.user_profile (install_source)
  WHERE install_source IS NOT NULL;

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.user_profile_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profile_updated_at_trigger ON public.user_profile;
CREATE TRIGGER user_profile_updated_at_trigger
  BEFORE UPDATE ON public.user_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.user_profile_touch_updated_at();


-- ── 2. funnel_events: conversion funnel breadcrumbs ──────────
-- One row per discrete user action that matters for conversion.
-- See src/lib/funnelEvents.ts for the canonical event_type enum.
--
-- Why BIGSERIAL instead of UUID: funnel queries pivot on
-- (cohort_hash, created_at) — BIGSERIAL is denser + sorts by
-- insertion order natively, which matches funnel time-series
-- analytics access patterns.

CREATE TABLE IF NOT EXISTS public.funnel_events (
  id            BIGSERIAL PRIMARY KEY,
  cohort_hash   TEXT NOT NULL,
  event_type    TEXT NOT NULL,         -- enum lives in client code, not Postgres
  payload       JSONB,                 -- event-specific shape
  tier          TEXT,                  -- current tier at event time
  app_version   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot-path indexes — funnel analyses always slice by cohort or by
-- type within a time window.
CREATE INDEX IF NOT EXISTS funnel_events_cohort_created_idx
  ON public.funnel_events (cohort_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS funnel_events_type_created_idx
  ON public.funnel_events (event_type, created_at DESC);

-- Cleanup-friendly index for retention purges (drop rows older
-- than 12 months to keep table size bounded).
CREATE INDEX IF NOT EXISTS funnel_events_created_idx
  ON public.funnel_events (created_at);


-- ── 3. Row Level Security ─────────────────────────────────────
ALTER TABLE public.user_profile  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies (idempotent re-run safety)
DROP POLICY IF EXISTS "user_profile_anon_insert"  ON public.user_profile;
DROP POLICY IF EXISTS "user_profile_anon_update"  ON public.user_profile;
DROP POLICY IF EXISTS "user_profile_anon_select"  ON public.user_profile;
DROP POLICY IF EXISTS "funnel_events_anon_insert" ON public.funnel_events;

-- user_profile: anon may INSERT and UPDATE their own row (keyed
-- by cohortHash). NO SELECT for anon — server-side analytics only.
CREATE POLICY "user_profile_anon_insert"
  ON public.user_profile
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "user_profile_anon_update"
  ON public.user_profile
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- funnel_events: insert-only for anon. Reads are server-side
-- (service_role bypasses RLS) — typically through scheduled
-- analytics jobs feeding PostHog / dashboards.
CREATE POLICY "funnel_events_anon_insert"
  ON public.funnel_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);


-- ── 4. Direct GRANT cleanup ───────────────────────────────────
-- RLS layers on top of grants. Explicit grants make the
-- minimum-required set crystal clear.

REVOKE ALL  ON public.user_profile  FROM anon, authenticated;
-- SELECT is required even though anon must NOT be able to read other users'
-- profiles: PostgREST upserts (POST + Prefer: resolution=merge-duplicates →
-- INSERT ... ON CONFLICT DO UPDATE) need the table-level SELECT privilege or
-- Postgres rejects with 42501 "permission denied for table". Privacy is still
-- enforced at the RLS layer: there is NO SELECT *policy*, so any GET returns
-- an empty set — the GRANT only unlocks the upsert's internal conflict path.
-- (Without this, the client's upsertUserProfile sync 401s on every scan.)
GRANT  SELECT, INSERT, UPDATE ON public.user_profile  TO anon, authenticated;

REVOKE ALL  ON public.funnel_events FROM anon, authenticated;
GRANT  INSERT ON public.funnel_events TO anon, authenticated;
-- USAGE on the sequence is required so anon clients can advance the
-- BIGSERIAL `id` column on INSERT. (USAGE is invalid as a table-level
-- privilege — Postgres errors with 0LP01 if you bundle it into the
-- table GRANT.)
GRANT  USAGE ON SEQUENCE public.funnel_events_id_seq TO anon, authenticated;


-- ── 5. Materialized view: funnel_daily ────────────────────────
-- Pre-aggregated daily roll-up so the PostHog import job / Looker
-- Studio doesn't slam funnel_events with COUNT DISTINCT queries
-- every page load. Refreshed daily via pg_cron.

DROP MATERIALIZED VIEW IF EXISTS public.funnel_daily;
CREATE MATERIALIZED VIEW public.funnel_daily AS
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Bangkok') AS day,
  event_type,
  tier,
  COUNT(*)                       AS event_count,
  COUNT(DISTINCT cohort_hash)    AS unique_users
FROM public.funnel_events
WHERE created_at > now() - INTERVAL '90 days'
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS funnel_daily_pk_idx
  ON public.funnel_daily (day, event_type, COALESCE(tier, '_'));

-- NOTE: security_invoker is a regular-VIEW option only (PG 15+) — it
-- does NOT apply to MATERIALIZED VIEWs (Postgres errors with 22023
-- "unrecognized parameter"). Materialized views always run as their
-- owner (postgres) during REFRESH, which is fine because:
--   1. funnel_daily is REFRESHED by pg_cron (server-side, owner role)
--   2. Read access for end clients is fully revoked below — only
--      service_role can SELECT it via the analytics pipeline.
-- Defence-in-depth: explicit REVOKE keeps anon/authenticated out.

REVOKE ALL ON public.funnel_daily FROM anon, authenticated;


-- ── 6. pg_cron daily refresh (optional, idempotent) ──────────
-- 03:00 Asia/Bangkok = 20:00 UTC. Quiet window — no live scans.
--
-- pg_cron is available on Supabase but must be explicitly ENABLED
-- per-project via Dashboard → Database → Extensions → pg_cron. The
-- block below tries to enable it AND schedule the refresh job. If
-- the extension isn't available (or the user lacks permission), we
-- log a NOTICE and continue — the rest of the migration must succeed
-- so the app's funnel_events writes still work.
--
-- Manual fallback if pg_cron stays disabled:
--   • Run REFRESH MATERIALIZED VIEW CONCURRENTLY public.funnel_daily;
--     from a daily Supabase Edge Function on a schedule, OR
--   • Drop the materialized view + query funnel_events directly.

DO $$
BEGIN
  -- Try to enable pg_cron. Requires superuser on plain Postgres but
  -- Supabase grants postgres role the ability to CREATE EXTENSION
  -- for the curated allow-list (pg_cron is on it).
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION
    WHEN insufficient_privilege OR undefined_file THEN
      RAISE NOTICE 'pg_cron extension not available — skipping cron schedule. Refresh funnel_daily manually or via Edge Function.';
      RETURN;
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron CREATE EXTENSION failed (%): skipping cron schedule.', SQLERRM;
      RETURN;
  END;

  -- Unschedule any prior job with this name (idempotent re-run).
  BEGIN
    PERFORM cron.unschedule('refresh-funnel-daily');
  EXCEPTION
    WHEN OTHERS THEN
      -- job didn't exist; ignore
      NULL;
  END;

  -- Schedule the refresh.
  PERFORM cron.schedule(
    'refresh-funnel-daily',
    '0 20 * * *',  -- 20:00 UTC = 03:00 ICT
    $cron$REFRESH MATERIALIZED VIEW CONCURRENTLY public.funnel_daily;$cron$
  );

  RAISE NOTICE 'pg_cron job refresh-funnel-daily scheduled for 20:00 UTC daily.';
END;
$$;


-- ── 7. Sanity verification (informational; uncomment to check) ─
-- After applying, these should return rows:
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('user_profile','funnel_events');
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename IN ('user_profile','funnel_events');
--
-- SELECT jobname, schedule FROM cron.job
-- WHERE jobname = 'refresh-funnel-daily';
