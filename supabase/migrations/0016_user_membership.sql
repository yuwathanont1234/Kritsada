-- 0016_user_membership.sql
-- Server-side membership mirror — the missing half of entitlement integrity.
--
-- WHY: the user's tier currently lives ONLY in client AsyncStorage (mirrored
-- from RevenueCat on-device). The edge functions are tier-blind, so a modded
-- client gets Premium-grade AI work (heatmap, grounded price) by simply
-- sending those labels. This table is written EXCLUSIVELY by the
-- revenuecat-webhook edge function (service_role) from store-validated
-- receipts, and read by analyze-watch's tier gate (shadow by default —
-- TIER_GATE_ENFORCE=true once RevenueCat is live in production).
--
-- The client may SELECT its own row to cross-check its local cache, but can
-- never write — there is deliberately NO path for a user to set their tier.

CREATE TABLE IF NOT EXISTS public.user_membership (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier       text NOT NULL DEFAULT 'free'
             CHECK (tier IN ('free', 'standard', 'pro', 'premium')),
  -- NULL = no known expiry (lifetime / not yet reported). The tier gate
  -- treats an expired row as 'free'.
  expires_at timestamptz,
  source     text NOT NULL DEFAULT 'revenuecat',
  -- Raw last event type, for debugging webhook flows (INITIAL_PURCHASE,
  -- RENEWAL, EXPIRATION, ...).
  last_event text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_membership ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_membership FROM anon, authenticated;

-- Read-own-row only. No INSERT/UPDATE/DELETE for any client role —
-- service_role (webhook) bypasses RLS.
DROP POLICY IF EXISTS user_membership_select_own ON public.user_membership;
CREATE POLICY user_membership_select_own ON public.user_membership
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
GRANT SELECT ON public.user_membership TO authenticated;
