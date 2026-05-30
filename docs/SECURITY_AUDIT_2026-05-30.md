# Security & Abuse Audit — 2026-05-30 (overnight)

Two read-only audits (free-tier abuse + backend security) plus 3 hardening tasks.
Nothing destructive was run. Code-grounded findings with `file:line`. Severity:
🔴 critical / 🟠 high / 🟡 medium / ⚪ low.

---

## TL;DR — the one thing that matters

**The company's AI spend is effectively UNBOUNDED.** The edge functions
(`analyze-watch` = Gemini, `embed-image` = Replicate) are gated only by the
**public anon key** (shipped in the JS bundle) and a per-device cap that is
**keyed on a `deviceId` the client itself supplies**. An attacker (or a tampered
client) sends a fresh random `deviceId` per request → a brand-new 400-call/day
bucket every time → unlimited paid AI calls. Honest users get unlimited *free*
scans simply by reinstalling (all scan counters live in AsyncStorage).

The real fix is **server-side enforcement tied to a verified identity** (the
`feat/supabase-auth` work): require a real user JWT in the edge functions, key
the quota on the server-derived `sub` (never the client body), and keep the
authoritative scan ledger server-side. A *durable client device id* does NOT
fix this (a tampered client spoofs any client id) — which is why I did not build
it; see "Overnight task status" below.

---

## ✅ Landed tonight (safe, committed)

| Fix | What | Risk |
|---|---|---|
| **search_path migration** | `0010_harden_function_search_path.sql` — pins `search_path = public, pg_temp` on `delete_my_scan_events` (SECURITY DEFINER, was missing it) and `conformity_to_reference`. Additive ALTER, no body change. | none — **run the migration to apply** |
| **Dead-code cleanup** | Removed `AiMetricsPanel`/`MetricRow` (~200 dead lines) + dead aiRouter imports/var. | none, typecheck clean |
| **Cold-start retry** | `embedImageReal` now retries 2× with graduated backoff (2.5s, 6s) instead of 1×@1.5s — salvages "almost-warm" scans; still fails fast (Gemini carries) if fully cold. | low (only slows the failing path) |

> The two edge-function / RLS-policy fixes below were **NOT auto-applied** —
> they change live behavior and must be verified on-device, which can't be done
> while you're asleep. They're written up as ready-to-apply recommendations.

---

## 🔴🟠 Free-tier abuse findings

| # | Sev | Finding | Where |
|---|---|---|---|
| C1 | 🔴 | Entire scan limit is client-side AsyncStorage → reinstall / "clear data" = fresh 5 free scans + fresh 30-day window, infinitely | `storage.ts:8-30`, `tier.ts:226-234`, `auth.ts:11-21` |
| C2 | 🔴 | Phone-OTP trial unlock is **fake** — code is `Math.random()` generated on-device, stored locally, even **returned in the result**; no SMS. → infinite trial resets | `simRegistry.ts:116-127,152-168`, `auth.ts:348` |
| C3 | 🔴 | Email OTP is real but scan limits aren't tied to the account → unlimited disposable-email accounts each reset nothing server-side | `auth.ts:147-169` |
| C4 | 🔴 | Tampered client calls edge functions directly with the public anon key, bypassing **all** client gating | `supabase.ts:6`, `analyze-watch:61-102`, `embed-image:8-143` |
| C5 | 🔴 | The one server cap (`consume_edge_quota`) is keyed on the client-supplied, freely-rotatable `deviceId` (`= ensureCohortHash()`, `Math.random`, rotatable via Settings→delete-data) → unbounded | `0008_edge_quota.sql`, `dataConsent.ts:49-54,172`, edge `:67,77` |
| H1 | 🟠 | **AI Hallmark heatmap is ungated/uncapped for all tiers** — `runHeatmap` never calls `checkHeatmapAllowed`/`incrementMonthlyHeatmap` (plumbing exists, unwired); refresh button re-fires unlimited @~฿1 each | `VerdictHeader.tsx` `runHeatmap`, `geminiAi.ts:1068`, `tier.ts:410-439` |
| H2 | 🟠 | LoadingScreen never re-checks `checkScanAllowed` before the AI call; counter decremented only *after* success (gate + spend not atomic) | `LoadingScreen.tsx:566-690` |
| M1 | 🟡 | One scan fans out to ~4-5 billable calls; a low-confidence image forces the grounded retry (~10× cost, ฿2) — an abuser can deliberately trigger it | `aiRouter.ts:174-226` |
| M2 | 🟡 | `membership` defaults to `'premium'` when unset; mock IAP unlocks tiers locally with no receipt validation | `auth.ts:243,248`, `iap.ts:273-284` |
| M3 | 🟡 | `consume_edge_quota` fails open on empty/short deviceId + missing IP → send `deviceId:""` + strip XFF = no enforcement | `0008_edge_quota.sql:43-45`, edge `:77-80` |
| L2 | ⚪ | DEV reset helpers (`resetAllQuotas`, `clearTrial`, `startTrialAgain`) may not be `__DEV__`-guarded in the Settings dev block | `tier.ts:507`, `auth.ts:348,361`, `SettingsScreen.tsx:774` |

## 🟠🟡 Backend security findings

| # | Sev | Finding | Where |
|---|---|---|---|
| S-H1 | 🟠 | Intended edge gate `EMBED_FUNCTION_SECRET` (named in `0007`) is **never enforced** — neither function reads it | `analyze-watch`, `embed-image` |
| S-M3 | 🟡 | `user_profile` allows anon `SELECT/UPDATE USING(true)` → anyone who learns a cohort_hash can read `phone_e164`/`push_token` and overwrite push tokens (hijack re-engagement) | `0005_conversion_telemetry.sql:148-165,189` |
| S-M1 | 🟡 | `conformity_to_reference` missing `search_path` → **FIXED in 0010** | `0009` |
| S-M2 | 🟡 | `delete_my_scan_events` (DEFINER) missing `search_path` → **FIXED in 0010** | `05-analytics:125-140` |
| S-M4 | 🟡 | `dist/` build output is committed despite being gitignored (50 files, embeds anon key — safe today but hygiene + future-leak risk) | `dist/`, `.gitignore:19` |
| S-L1 | ⚪ | Edge CORS is `*` — fine for native, only matters if a web client + H1 combine | edge functions |
| S-L2 | ⚪ | Gemini prompt is fully client-controlled → can poison the public `watch_price_cache` (only consequence; no privileged write) | `analyze-watch:67,253-266` |

## ✅ Things that are FINE — don't be alarmed
- **Anon key in the bundle** — expected & safe (role=anon, not service_role). The `eyJ...placeholder` literal is a non-functional fallback.
- **No tracked `.env`, no hardcoded service_role/Gemini/Replicate secrets** — all from env/GitHub secrets. Clean.
- **RLS lockdown (0003/0004/0008)** — `harvest_jobs`, `watch_embeddings`, `edge_quota`, `cost_daily_summary`, price-cache writes are correctly default-deny / service-role-only. Solid.
- **`consume_edge_quota`** — correctly `security definer` + `search_path` + revoked from anon/authenticated, granted only to service_role.
- **`match_*` RPCs** — read-only, pinned search_path, 30s statement timeout, expose only already-public data.
- **keep-warm / re-engagement DEFINER fns** — read the service JWT from Vault, never source.
- **`send-re-engagement`** — only fetches fixed hosts (no SSRF); `embed-image` has a 5MB cap + bounded polling.

---

## 🎯 Recommended roadmap (needs your decision)

1. **[biggest lever] Server-side auth + quota** — in `feat/supabase-auth`: require a real user JWT in `analyze-watch` + `embed-image`; key `consume_edge_quota` on the JWT `sub` (+ hashed IP), not the client body; move the scan ledger server-side (decrement in the edge). Closes C1/C3/C4/C5/H2 at once.
2. **Global daily cost ceiling** — wire the existing `cost_budget_config.daily_budget_usd` circuit-breaker into the edge functions so total platform spend is capped regardless of device-id gaming (set it generously high + fail-open). Bounds worst-case spend even before #1 lands. *(I scoped this but did not auto-apply — it touches the live edge path.)*
3. **Gate the heatmap (H1)** — quick win: in `runHeatmap`, call `checkHeatmapAllowed` + `incrementMonthlyHeatmap` (plumbing already exists) and decide whether AI Hallmark is Premium-only or just capped/refresh-limited. **Product decision** — tell me which and I'll wire it.
4. **Real phone OTP (C2)** — replace the `Math.random()` trial unlock with Supabase phone OTP (mirror the working email path) + a server "one trial per identity" record.
5. **`user_profile` policy (S-M3)** — drop the anon `SELECT/UPDATE USING(true)` policy; move the upsert into a service-role edge function. Stops phone/push-token exposure.
6. **Default membership → `'free'` (M2)** + validate IAP receipts server-side.
7. **Housekeeping** — `git rm -r --cached dist/` (S-M4); `__DEV__`-guard reset helpers (L2); enable `noUnusedLocals` and clear the ~44 remaining unused-import warnings.

---

## Overnight task status (your 4 picks)

1. **Audit (read-only)** → ✅ done — this report (2 audits, all findings above).
2. **Edge-quota #2 "durable device id"** → ⚠️ re-scoped. The audit proved a durable
   *client* id doesn't stop abuse (tampered clients spoof any id) and it needs new
   native deps (`expo-secure-store`) + on-device testing. The effective fix is
   server-side keying (roadmap #1) + a global ceiling (#2). Documented, not built —
   awaiting your call on the auth approach.
3. **Cold-start** → ✅ partial — bumped embed retry (2× backoff) to salvage
   near-warm scans. Full fix is infra (dedicated Replicate instance ~฿15-20k/mo,
   previously rejected) or a real keep-warm embed. RAG + classifier already degrade
   gracefully (Gemini carries; classifier has its own resilient retry).
4. **Dead-code cleanup** → ✅ done (biggest dead code removed; ~44 minor unused
   imports left for a focused `noUnusedLocals` pass).
