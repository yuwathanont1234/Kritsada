-- 0018_guardian_schema.sql
-- Guardian (ผู้พิทักษ์) anti-scam MVP schema.
--
-- All tables use the guardian_ prefix so they coexist with the watch-app tables
-- in the same Supabase project. Writes go through the guardian-analyze Edge
-- Function using the service_role key (which bypasses RLS); authenticated users
-- can only ever SELECT/modify their own rows. RLS is ENABLED on every table —
-- a table with RLS on and no permissive policy is default-deny for anon.

-- ─────────────────────────────────────────────────────────────────
-- 1. IDENTIFIER REGISTRY  (Layer 1 — identity check)
-- ─────────────────────────────────────────────────────────────────
-- A miss on this table = UNKNOWN (by design — rows only exist for BAD/LICENSED).
-- Seeded below with TEST data so the Decision Matrix can exercise every cell
-- before the real Blacklistseller / SEC sync lands (pending ToS review).
CREATE TABLE IF NOT EXISTS public.guardian_identifiers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_type  text        NOT NULL
                   CHECK (identifier_type IN ('phone','bank_account','promptpay','url','entity_name')),
  identifier_value text        NOT NULL,   -- normalized (digits-only for phone/account)
  status           text        NOT NULL DEFAULT 'UNKNOWN'
                   CHECK (status IN ('BAD','LICENSED','UNKNOWN')),
  source           text        NOT NULL DEFAULT 'manual',
  source_detail    text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identifier_type, identifier_value)
);

CREATE INDEX IF NOT EXISTS guardian_identifiers_lookup
  ON public.guardian_identifiers (identifier_type, identifier_value);

ALTER TABLE public.guardian_identifiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_identifiers FROM anon, authenticated;
-- Authenticated clients may read (a future client-side pre-check could use it);
-- writes remain service-role-only.
CREATE POLICY guardian_identifiers_auth_read
  ON public.guardian_identifiers FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.guardian_identifiers TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2. ANALYSIS CACHE  (7-day, keyed on SHA-256 of content)
-- ─────────────────────────────────────────────────────────────────
-- content_hash is computed SERVER-SIDE in the edge function so it can be
-- trusted (never client-minted). cached_result is the full FinalResponse JSON.
CREATE TABLE IF NOT EXISTS public.guardian_analysis_cache (
  content_hash   text        PRIMARY KEY,   -- SHA-256 hex
  content_type   text        NOT NULL CHECK (content_type IN ('text','image')),
  cached_result  jsonb       NOT NULL,
  model_version  text        NOT NULL DEFAULT 'claude-sonnet-4-6',
  hit_count      int         NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS guardian_analysis_cache_expiry
  ON public.guardian_analysis_cache (expires_at);

ALTER TABLE public.guardian_analysis_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_analysis_cache FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 3. ANALYSIS LOG  (per-request audit trail)
-- ─────────────────────────────────────────────────────────────────
-- user_id may be NULL for unauthenticated checks. Every row records which rule
-- of the matrix fired (layer1_status + ai_score → risk_level) for legal audit.
CREATE TABLE IF NOT EXISTS public.guardian_analysis_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  content_type    text        NOT NULL CHECK (content_type IN ('text','image')),
  content_hash    text        NOT NULL,
  identifiers     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  layer1_status   text        NOT NULL DEFAULT 'UNKNOWN'
                  CHECK (layer1_status IN ('BAD','LICENSED','UNKNOWN')),
  ai_score        int,
  risk_level      text        NOT NULL CHECK (risk_level IN ('RED','YELLOW','GREEN')),
  red_flag_count  int         NOT NULL DEFAULT 0,
  from_cache      boolean     NOT NULL DEFAULT false,
  response_ms     int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guardian_log_user_idx
  ON public.guardian_analysis_log (user_id, created_at DESC);

ALTER TABLE public.guardian_analysis_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_analysis_log FROM anon, authenticated;
CREATE POLICY guardian_log_select_own
  ON public.guardian_analysis_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
GRANT SELECT ON public.guardian_analysis_log TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 4. FAMILY LINKS  (guardian ↔ protected, joined by invite code)
-- ─────────────────────────────────────────────────────────────────
-- guardian_user_id  = the child/relative who RECEIVES red-flag alerts.
-- protected_user_id = the parent/elder being watched over (NULL until redeemed).
-- Either party may create the invite; the other redeems it via the RPC below.
CREATE TABLE IF NOT EXISTS public.guardian_family_links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protected_user_id uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code       text        NOT NULL UNIQUE,
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','revoked')),
  notify_on         text[]      NOT NULL DEFAULT ARRAY['RED'],
  created_at        timestamptz NOT NULL DEFAULT now(),
  activated_at      timestamptz
);

CREATE INDEX IF NOT EXISTS guardian_family_guardian_idx
  ON public.guardian_family_links (guardian_user_id);
CREATE INDEX IF NOT EXISTS guardian_family_protected_idx
  ON public.guardian_family_links (protected_user_id) WHERE protected_user_id IS NOT NULL;

ALTER TABLE public.guardian_family_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_family_links FROM anon;
-- A user can see/modify any link they are a party to (either side).
CREATE POLICY guardian_family_select_own
  ON public.guardian_family_links FOR SELECT TO authenticated
  USING (auth.uid() = guardian_user_id OR auth.uid() = protected_user_id);
CREATE POLICY guardian_family_insert_guardian
  ON public.guardian_family_links FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = guardian_user_id);
CREATE POLICY guardian_family_update_own
  ON public.guardian_family_links FOR UPDATE TO authenticated
  USING (auth.uid() = guardian_user_id OR auth.uid() = protected_user_id);
CREATE POLICY guardian_family_delete_own
  ON public.guardian_family_links FOR DELETE TO authenticated
  USING (auth.uid() = guardian_user_id OR auth.uid() = protected_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_family_links TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 5. PUSH TOKENS  (Expo push token per user)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guardian_push_tokens (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_token  text        NOT NULL,
  platform    text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, expo_token)
);

ALTER TABLE public.guardian_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_push_tokens FROM anon;
-- Users manage their own tokens; the edge function (service_role) reads any
-- token to dispatch a family alert.
CREATE POLICY guardian_push_select_own
  ON public.guardian_push_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY guardian_push_insert_own
  ON public.guardian_push_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY guardian_push_update_own
  ON public.guardian_push_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY guardian_push_delete_own
  ON public.guardian_push_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_push_tokens TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 6. HELPER: cache hit increment (service_role, called by edge fn)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guardian_cache_hit(p_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.guardian_analysis_cache
     SET hit_count  = hit_count + 1,
         expires_at = now() + INTERVAL '7 days'   -- sliding window on every hit
   WHERE content_hash = p_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.guardian_cache_hit(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_cache_hit(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- 7. HELPER: redeem a family invite code (authenticated caller = protected)
-- ─────────────────────────────────────────────────────────────────
-- The protected user (parent) enters the code the guardian (child) shared.
-- SECURITY DEFINER so the caller can flip a row they don't yet own; we still
-- guard against self-linking and double-redemption.
CREATE OR REPLACE FUNCTION public.guardian_redeem_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link  public.guardian_family_links;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_link
    FROM public.guardian_family_links
   WHERE invite_code = upper(trim(p_code))
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF v_link.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_used');
  END IF;

  IF v_link.guardian_user_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_link_self');
  END IF;

  UPDATE public.guardian_family_links
     SET protected_user_id = v_uid,
         status            = 'active',
         activated_at      = now()
   WHERE id = v_link.id;

  RETURN jsonb_build_object('ok', true, 'link_id', v_link.id);
END;
$$;

REVOKE ALL ON FUNCTION public.guardian_redeem_invite(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guardian_redeem_invite(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 8. SEED  (TEST data only — clearly tagged source='seed_test')
-- ─────────────────────────────────────────────────────────────────
-- Lets the Decision Matrix exercise BAD and LICENSED cells in dev. Remove or
-- replace with real regulatory data before production.
INSERT INTO public.guardian_identifiers (identifier_type, identifier_value, status, source, source_detail, notes)
VALUES
  ('phone',        '0812345678', 'BAD',      'seed_test', 'demo blacklist entry', 'ตัวอย่างเบอร์ในบัญชีดำ (ข้อมูลทดสอบ)'),
  ('bank_account', '1234567890', 'BAD',      'seed_test', 'demo blacklist entry', 'ตัวอย่างเลขบัญชีต้องสงสัย (ข้อมูลทดสอบ)'),
  ('promptpay',    '0898887777', 'BAD',      'seed_test', 'demo blacklist entry', 'ตัวอย่างพร้อมเพย์ในบัญชีดำ (ข้อมูลทดสอบ)'),
  ('url',          'scam-invest-example.com', 'BAD', 'seed_test', 'demo blacklist entry', 'ตัวอย่าง URL หลอกลงทุน (ข้อมูลทดสอบ)'),
  ('entity_name',  'บริษัทหลักทรัพย์ตัวอย่าง จำกัด', 'LICENSED', 'seed_test', 'demo SEC licensed list', 'ตัวอย่างผู้ได้รับอนุญาต (ข้อมูลทดสอบ)')
ON CONFLICT (identifier_type, identifier_value) DO NOTHING;
