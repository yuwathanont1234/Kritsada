-- ============================================================
-- Price Cache Hardening — drop dangling write policies +
-- add lookup indexes that the mobile client actually queries.
-- ============================================================
-- Background:
--   Migration 0003 enabled RLS + REVOKEd all grants from anon/
--   authenticated on watch_price_cache, which blocks anon writes
--   at the Postgres-grant layer (before RLS policies are even
--   evaluated). HOWEVER the original 03-price-cache.sql created
--   three permissive write policies that never got dropped in
--   0003 (the DROP statement targeted "_public_write" but the
--   actual policy names are "_public_upsert", "_public_update",
--   "_public_delete"). The policies are inert today because the
--   underlying GRANTs are revoked, but they are a foot-gun: a
--   future operator who restores GRANTs would unintentionally
--   re-open the cache to anon writes.
--
-- Also: the mobile client (src/lib/geminiAi.ts:953) queries the
-- cache by (brand_key, ref_key) — neither of which has an index.
-- At 1K DAU × ~3 price lookups/scan, a sequential scan over a
-- growing cache table becomes the slowest query on the read path.
--
-- Apply via Supabase Dashboard → SQL Editor → paste & run.
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. Drop the dangling write policies. No-op if they
--      somehow don't exist (different deploy state).
DROP POLICY IF EXISTS "watch_price_cache_public_upsert"  ON public.watch_price_cache;
DROP POLICY IF EXISTS "watch_price_cache_public_update"  ON public.watch_price_cache;
DROP POLICY IF EXISTS "watch_price_cache_public_delete"  ON public.watch_price_cache;
DROP POLICY IF EXISTS "watch_price_cache_public_write"   ON public.watch_price_cache;

-- ── 2. Re-confirm default-deny posture. RLS is already enabled
--      by 0003 but ENABLE-if-not-enabled keeps this migration
--      self-contained.
ALTER TABLE public.watch_price_cache ENABLE ROW LEVEL SECURITY;

-- ── 3. Keep the public SELECT policy. Reading the cache is fine
--      from any client (it only contains aggregated public price
--      data, not user PII).
DROP POLICY IF EXISTS "watch_price_cache_public_read" ON public.watch_price_cache;
CREATE POLICY "watch_price_cache_public_read"
  ON public.watch_price_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── 4. Grant SELECT back so the public_read policy has something
--      to evaluate against. 0003's REVOKE ALL was too broad —
--      it stripped SELECT too, so even the read policy was inert
--      for anon clients. Restore the minimum that the mobile app
--      actually needs.
GRANT SELECT ON public.watch_price_cache TO anon, authenticated;
-- Writes stay revoked. service_role retains BYPASSRLS-level
-- access via its role attribute, so the upsert-price-cache Edge
-- Function (server-side, runs as service_role) can still write.

-- ── 5. Lookup indexes — the mobile client reads by (brand_key,
--      ref_key); add an index covering both columns. PK on
--      cache_key remains for legacy schema compatibility.
--
--   NOTE: This migration assumes the deployed table has columns
--   brand_key + ref_key (the schema the client actually queries).
--   The legacy 03-price-cache.sql declares brand + reference
--   instead. If the deployed table doesn't have brand_key/ref_key,
--   this index creation will error — that's the signal to align
--   the schemas (the client has been writing to a table that the
--   migration file doesn't describe, so the source of truth is
--   the live DB, not the .sql file).
CREATE INDEX IF NOT EXISTS watch_price_cache_brand_ref_idx
  ON public.watch_price_cache (brand_key, ref_key);

-- Secondary index for cache-freshness queries / TTL sweeps.
-- Already exists from 03-price-cache.sql as
-- watch_price_cache_fetched_at_idx (on fetched_at DESC), but the
-- client uses cached_at. Add the client-aligned one too.
CREATE INDEX IF NOT EXISTS watch_price_cache_cached_at_idx
  ON public.watch_price_cache (cached_at DESC);

-- ── 6. Sanity verification (informational; uncomment to run)
-- After applying, you should see:
--   - 1 SELECT policy, 0 INSERT/UPDATE/DELETE policies
--   - 2 new indexes on the lookup + freshness paths
--
-- SELECT policyname, cmd, roles
-- FROM pg_policies
-- WHERE tablename = 'watch_price_cache';
--
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'watch_price_cache';
