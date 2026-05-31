-- 0014_user_profile_close_pii_read.sql
-- Audit S-M3: user_profile had an anon `FOR SELECT USING (true)` policy, letting
-- ANY anonymous client read ANY row's PII (phone_e164, push_token, line_user_id,
-- country) given a cohort_hash — and overwrite push tokens. This closes the
-- READ-exfiltration half (the worse one).
--
-- Why this is safe (verified against the client):
--   • The ONLY writes to user_profile are upserts with
--     `Prefer: resolution=merge-duplicates,return=minimal`
--     (src/lib/userProfile.ts:172, src/lib/pushNotifications.ts:213) → they
--     don't read the row back, so they don't need a SELECT policy.
--   • The client NEVER GETs/selects user_profile from the server (it keeps a
--     local copy in AsyncStorage).
--   • Server-side reads (send-re-engagement / dispatch) run as service_role,
--     which bypasses RLS → unaffected.
-- With RLS on and no SELECT policy, anon SELECT returns zero rows (default-deny)
-- while the INSERT + UPDATE upsert path keeps working.
--
-- The migration comment in 0005 claiming "the upsert needs a SELECT policy" was
-- stale (it predates the switch to return=minimal).

DROP POLICY IF EXISTS "user_profile_anon_select" ON public.user_profile;

-- Belt-and-suspenders at the grant layer too (harmless to the return=minimal
-- upsert, which needs only INSERT + UPDATE).
REVOKE SELECT ON public.user_profile FROM anon;

-- NOTE (residual, low): the anon UPDATE policy stays `USING (true)` because the
-- on-conflict upsert needs it and anon has no auth identity to scope it to "own
-- row". Practical risk is low — it only allows a BLIND overwrite of a row whose
-- 32-char random cohort_hash you already know, and after this migration
-- cohort_hashes no longer leak via the DB (funnel_events has no anon SELECT
-- either). The full fix (move the upsert behind a service_role edge function and
-- drop all anon policies) is deferred — it needs a client change + on-device
-- verification of push-token registration.
