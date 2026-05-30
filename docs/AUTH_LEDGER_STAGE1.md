# Server-side scan ledger — Stage 1 (SHADOW) — for review before deploy

Closes the foundation for audit findings **C1 / C3 / C5** (free scans reset by
reinstall; quota keyed on a resettable client value). Rollout = **shadow first,
then flip** (your call). This stage records but does **not** block — zero risk of
locking anyone out.

## What changed (2 files, server-only — NO client change)

1. **`supabase/migrations/0011_user_scan_ledger.sql`** (new)
   - Table `user_scan_ledger (user_id, period_key, scans_used, …)` keyed on
     `auth.users.id`. RLS on, no policies → default-deny; only `service_role`
     touches it.
   - RPC `record_user_scan(user_id, period)` — atomic +1, returns this month's
     count + the lifetime total. `service_role` only, `search_path` pinned.

2. **`supabase/functions/analyze-watch/index.ts`** (shadow block)
   - On `label === 'identify'` (fires **once per scan**), read the JWT from the
     `Authorization` header → `admin.auth.getUser(jwt)` → if a real user, call
     `record_user_scan` and log `[scan-ledger:shadow] user=… period_used=N lifetime=M`.
   - Anon key / service_role / expired session / logged-out → `getUser` returns
     no user → logs `no authenticated user … device cap only` and falls through
     unchanged. **keep-warm, the training script, and logged-out paths are not
     affected.** Every branch is fail-open (a ledger error never blocks a scan).
   - `embed-image` is intentionally untouched in Stage 1 (avoids adding auth
     latency to the 2 embeds/scan hot path; Stage 2 extends auth to it).

## Why it's safe
- Purely additive: a new table + one `if (label==='identify')` block.
- Never blocks, never throws fatally (try/catch fail-open).
- No client change — supabase-js already attaches the logged-in user's JWT to
  `functions.invoke`; the server simply starts reading it.

## How to deploy + what to watch
1. Run the migration `0011_user_scan_ledger.sql`.
2. `supabase functions deploy analyze-watch`.
3. Scan a few times **while logged in with a real account** (real email-OTP /
   Google — not the `__DEV__` mock login) and watch the function logs:
   - ✅ Expect `[scan-ledger:shadow] user=xxxxxxxx period_used=N lifetime=M`,
     incrementing across scans, and **surviving a reinstall** (same account →
     lifetime keeps climbing). That proves the foundation.
   - ⚠️ If you instead see `no authenticated user … device cap only` on a real
     logged-in scan, the app isn't attaching a real JWT (likely the mock-login
     fallback in `isAuthenticated`) — we must fix that before Stage 2 enforces,
     or real users would be miscounted.

## Next (after you've reviewed/deployed Stage 1)
- **Stage 2 (enforce):** flip the block to read the tier cap and return 429
  before the Gemini call when over quota; extend JWT auth to `embed-image`;
  decide the free-tier bucket (lifetime vs monthly). A reinstall can no longer
  reset the count.
- **Stage 3 (entitlement):** RevenueCat webhook → a `user_subscriptions` table
  so the server knows each user's real paid tier (5/20/50/100) instead of
  trusting the client. *(You opted in — I'll build this next.)*
