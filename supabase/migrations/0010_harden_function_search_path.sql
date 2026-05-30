-- 0010_harden_function_search_path.sql
-- Security hardening (from the 2026-05-30 backend audit, findings M1 + M2).
--
-- Pin `search_path` on two functions that were missing it. A function without a
-- fixed search_path resolves unqualified object names against the *caller's*
-- search_path — a classic privilege-escalation foot-gun: if an attacker can
-- create an object (table/function) in a schema that sits earlier on the path,
-- they can shadow the objects the function relies on. SECURITY DEFINER functions
-- are the dangerous case (they run as the owner), but pinning it on SECURITY
-- INVOKER read-only functions too keeps the codebase consistent and safe against
-- a future DEFINER change.
--
-- This migration is purely additive (ALTER ... SET) — it does NOT change any
-- function body, signature, or grant. Safe to run on a live DB. Idempotent.
--
-- Sibling RPCs (match_watches_v2, match_expert_cert) already pin
-- `search_path = public, pg_temp`; this brings these two in line.

-- M2 (HIGH-ish): delete_my_scan_events is SECURITY DEFINER, anon-callable, and
-- had no search_path. This is the one that matters most.
ALTER FUNCTION public.delete_my_scan_events(text)
  SET search_path = public, pg_temp;

-- M1 (low): conformity_to_reference is SECURITY INVOKER read-only, but pin it
-- anyway for consistency / future-proofing.
ALTER FUNCTION public.conformity_to_reference(vector, text, text, integer)
  SET search_path = public, pg_temp;
