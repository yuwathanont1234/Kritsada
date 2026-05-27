-- ============================================================
-- Security Lockdown: enable RLS on internal tables + fix
-- SECURITY DEFINER view on cost_daily_summary.
-- ============================================================
-- Triggered by Supabase Advisors flagging 5 CRITICAL issues:
--   • RLS Disabled in Public — harvest_jobs
--   • RLS Disabled in Public — watch_embeddings
--   • RLS Disabled in Public — watch_models
--   • RLS Disabled in Public — watch_price_cache
--   • Security Definer View — cost_daily_summary
--
-- All four tables are FastAPI-only (backend connects via
-- DATABASE_URL with service_role; service_role bypasses RLS by
-- design). Enabling RLS without granting any anon/authenticated
-- policy => default-deny for the public/anon roles. Backend
-- scripts continue to work unchanged.
--
-- Apply via Supabase Dashboard → SQL Editor → paste & run.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Enable RLS on the 4 flagged tables ───────────────────
-- "Default deny": once RLS is on AND no policy exists for a
-- role, that role cannot SELECT/INSERT/UPDATE/DELETE rows.
-- service_role bypasses this entirely.

ALTER TABLE public.harvest_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_embeddings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_models        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_price_cache   ENABLE ROW LEVEL SECURITY;

-- ── 2. Belt-and-suspenders: explicitly drop any pre-existing
--      policies that might inadvertently permit anon access.
--      Safe to no-op if they don't exist. ─────────────────────

DROP POLICY IF EXISTS "harvest_jobs_public_read"        ON public.harvest_jobs;
DROP POLICY IF EXISTS "harvest_jobs_public_write"       ON public.harvest_jobs;
DROP POLICY IF EXISTS "watch_embeddings_public_read"    ON public.watch_embeddings;
DROP POLICY IF EXISTS "watch_embeddings_public_write"   ON public.watch_embeddings;
DROP POLICY IF EXISTS "watch_models_public_read"        ON public.watch_models;
DROP POLICY IF EXISTS "watch_models_public_write"       ON public.watch_models;
DROP POLICY IF EXISTS "watch_price_cache_public_read"   ON public.watch_price_cache;
DROP POLICY IF EXISTS "watch_price_cache_public_write"  ON public.watch_price_cache;

-- ── 3. Tighten direct GRANTs.
-- Even with RLS, lingering table-level GRANTs to anon would let
-- a sufficiently privileged client (or a SECURITY DEFINER
-- function that explicitly sets role) bypass policies. Revoke
-- explicitly. service_role retains BYPASSRLS-level access via
-- its role attribute, so backend scripts keep working.

REVOKE ALL ON public.harvest_jobs       FROM anon, authenticated;
REVOKE ALL ON public.watch_embeddings   FROM anon, authenticated;
REVOKE ALL ON public.watch_models       FROM anon, authenticated;
REVOKE ALL ON public.watch_price_cache  FROM anon, authenticated;

-- ── 4. Fix SECURITY DEFINER view — cost_daily_summary
-- Postgres 15+ supports SECURITY INVOKER on views via the
-- WITH (security_invoker = on) reloption. That makes the view
-- execute with the privileges of the caller (not the owner) —
-- so any underlying RLS on cost_events / scan_events etc. is
-- properly applied. Without this, a query through the view
-- bypasses RLS and leaks rows the caller shouldn't see.
--
-- We don't know the original SELECT body, so we use ALTER VIEW
-- to flip the option in place. If the view was created with
-- a different reloption set, this is still idempotent.

ALTER VIEW IF EXISTS public.cost_daily_summary
  SET (security_invoker = on);

-- Also revoke any direct anon GRANT on the view itself —
-- security_invoker is the correct mode, but defence-in-depth
-- says keep anon out of cost telemetry views entirely.
REVOKE ALL ON public.cost_daily_summary FROM anon, authenticated;

-- ── 5. Sanity verification (informational; uncomment to run)
-- After applying, you should see:
--   rls_enabled = true   for all 4 tables
--   security_invoker = on for cost_daily_summary
--
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN (
--   'harvest_jobs','watch_embeddings','watch_models','watch_price_cache'
-- );
--
-- SELECT n.nspname, c.relname, c.reloptions
-- FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
-- WHERE c.relname = 'cost_daily_summary' AND c.relkind = 'v';
