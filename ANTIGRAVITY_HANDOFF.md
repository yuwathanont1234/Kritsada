# Luxury Authenticator — Refactor & Improvement Handoff

You are picking up a React Native / Expo app (TypeScript strict, Expo SDK 54, RN 0.81, React 19). The app authenticates luxury watches using Gemini AI + Supabase + visual RAG. Supports Thai/English. Owner is a solo dev/founder.

Work through the tasks below **in the order listed**. Each task is independent unless marked `depends on`. Stop and ask the owner before touching anything outside the scope of an individual task.

---

## Hard constraints (do not violate)

1. **Do not modify `.env`, do not commit secrets, do not touch git history.** The owner is handling key rotation and history cleanup separately.
2. **TypeScript strict mode stays on.** Do not relax `tsconfig.json` to silence errors — fix the types.
3. **Localization is symmetric.** Every new user-facing string must have both TH and EN entries in `src/lib/localization.ts`. Use `useLanguage()` — no hard-coded strings in screens.
4. **Tier model:** Free / Standard (990฿) / Pro (1990฿) / Premium (4990฿). No tier is unlimited — every quota has a hard cap. Do not add unlimited paths.
5. **Read tier through `effectiveCaps()`, not the raw `tier` field** — trial users get Premium caps while `tier === 'free'`.
6. **No new tests are required** unless a task explicitly says so. The repo currently has zero tests; do not invent a framework setup as a side effect.
7. **Do not move Gemini calls server-side in this handoff.** That work depends on a backend tier-validation design decision the owner has not made yet. Leave `src/lib/geminiAi.ts` alone except where a task says otherwise.

---

## Task 1 — Add `.gitignore`

**Why:** Repo has no `.gitignore`. `.DS_Store` is tracked. `.env` was previously committed (owner is rotating keys; you must prevent it happening again).

**Do:**
- Create `.gitignore` at repo root with at minimum:
  ```
  # macOS
  .DS_Store

  # Env
  .env
  .env.local
  .env.*.local

  # Expo
  .expo/
  dist/
  web-build/

  # Node
  node_modules/

  # Supabase
  supabase/.temp/

  # IDE
  .vscode/
  .idea/
  ```
- Run `git rm --cached .DS_Store` and `git rm --cached .env` (untrack but keep local copies).

**Acceptance:** `git status` shows `.env` and `.DS_Store` as untracked or removed-from-index; `.gitignore` is staged.

---

## Task 2 — Split `App.tsx` (4,784 lines)

**Why:** Single file holds Splash, Home, Portfolio, Profile, Settings, Otp screens plus navigation glue. Unreviewable.

**Do:**
- Move each screen into its own file under `src/screens/`:
  - `SplashScreen.tsx`
  - `HomeScreen.tsx`
  - `PortfolioScreen.tsx`
  - `ProfileScreen.tsx`
  - `SettingsScreen.tsx`
  - `OtpScreen.tsx`
- Keep `App.tsx` as **navigation root only** — providers (`LanguageProvider`, `SafeAreaProvider`), navigators, deep-link config. Target < 300 lines.
- Preserve all existing behavior. No prop renames, no signature changes, no styling changes.
- Existing `useState`/`AsyncStorage` patterns stay as-is — **do not introduce Context, Redux, Zustand, or any new state library**. Refactoring state management is a separate, larger decision.

**Acceptance:**
- `npx expo start` boots without errors.
- Every screen renders and navigates exactly as before.
- `wc -l App.tsx` returns < 300.

---

## Task 3 — Split `ResultScreen.tsx` (3,017 lines)

**Why:** Mixes verdict display, collection actions (save/edit/mark-sold), PDF export, share, analytics.

**Do:**
- Extract into co-located files under `src/screens/result/`:
  - `VerdictHeader.tsx` — verdict + confidence + heatmap toggle
  - `SpecsSection.tsx` — watch specs + price
  - `CollectionActions.tsx` — save, edit name/notes, mark sold
  - `PdfExporter.tsx` — PDF generation + share
  - `usePriceFallback.ts` — hook wrapping the brand fallback price logic currently at [ResultScreen.tsx:54-81](src/screens/ResultScreen.tsx:54)
- `ResultScreen.tsx` becomes the composition root (< 500 lines).
- **Do not change** the `route.params` contract (`result`, `frontUri`, `backUri`, `savedId`, `bgColor`) — other screens depend on it.

**Acceptance:**
- All result-screen actions still work (verify by running through: scan → result → edit name → save → mark sold → PDF export → share).
- `wc -l src/screens/ResultScreen.tsx` returns < 500.

---

## Task 4 — Move hardcoded brand prices into config

**Why:** [ResultScreen.tsx:54-81](src/screens/ResultScreen.tsx:54) hardcodes brand fallback prices (Daytona = 28400, etc.). Owner will eventually want to edit these without a code deploy.

**Do:**
- Create `src/lib/data/brandFallbackPrices.ts` exporting a typed structure:
  ```ts
  export type BrandFallbackEntry = { match: string; price: number };
  export const BRAND_FALLBACK_PRICES: Record<string, BrandFallbackEntry[]> = { ... };
  ```
- Move the logic from `getBrandFallbackPrice()` into a pure function in that file.
- Import and use from `ResultScreen.tsx` (or from the `usePriceFallback` hook if Task 3 is done).

**Acceptance:** Result screen shows the same fallback prices as before for the same watch models. No behavior change.

---

## Task 5 — Replace empty `catch {}` blocks with logged errors

**Why:** Silent failures across [src/lib/geminiAi.ts](src/lib/geminiAi.ts) (lines 162, 169, 183, 191), [src/lib/currency.ts](src/lib/currency.ts) (43, 63), [src/lib/collection.ts](src/lib/collection.ts) (58). Owner cannot debug what's broken.

**Do:**
- Grep for `catch {}` and `catch (e) {}` across `src/`.
- Replace each with:
  ```ts
  } catch (e) {
    console.warn('[<module>] <what was being attempted>:', e);
  }
  ```
- **Do not** turn swallowed errors into thrown ones — that changes behavior. Only add logging.
- Skip `App.tsx:381` Haptics fallback — that one is intentional (no-op on web).

**Acceptance:** Zero `catch {}` or `catch (e) {}` (with empty body) remain in `src/`. Owner can grep `[<module>]` in dev console to find failures.

---

## Task 6 — Render error UI in `LoadingScreen.tsx`

**Why:** [LoadingScreen.tsx:491](src/screens/LoadingScreen.tsx:491) defines `const [error, setError] = useState(...)` but never renders the error state. When Gemini times out or network drops, user sees a spinner forever.

**Do:**
- In the render section, before the existing loading UI, add:
  ```tsx
  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => { setError(null); /* re-trigger analysis */ }}
        onCancel={() => navigation.goBack()}
      />
    );
  }
  ```
- Create `src/components/ErrorState.tsx` — simple centered view with icon + message + two buttons.
- Add localization keys: `error.title`, `error.retry`, `error.cancel`, `error.networkFailed`, `error.aiFailed` in both TH and EN.

**Acceptance:** Force a Gemini failure (e.g., disconnect wifi mid-scan). User sees error UI with working Retry / Cancel buttons.

---

## Task 7 — Add accessibility labels

**Why:** Screen reader users get unlabeled buttons. Touch targets unverified.

**Do:**
- Add `accessibilityLabel` + `accessibilityRole="button"` to:
  - The shutter button in `src/screens/ScanScreen.tsx` (search for the `PrimaryButton` that triggers capture)
  - All article cards in `src/screens/MagazineScreen.tsx` (set role to `"button"`, label to the article title)
  - Tab bar buttons if not already labeled
- Use localized strings (`t('a11y.shutter')`, `t('a11y.article', { title })`, etc.) — add the keys in TH and EN.
- **Do not** change visual styling. Touch-target audit is out of scope for this task.

**Acceptance:** iOS VoiceOver reads "Capture photo, button" on the shutter and "<article title>, button" on each magazine card.

---

## Task 8 — Rename Magazine tab to "Learn / เรียนรู้"

**Why:** "Magazine" doesn't signal the educational content inside. Users skip the tab.

**Do:**
- Find the tab navigator (likely in the remnants of `App.tsx` or wherever the bottom tab is defined after Task 2).
- Change the tab label key from `tabs.magazine` to `tabs.learn`. Add to `localization.ts`:
  - EN: `"Learn"`
  - TH: `"เรียนรู้"`
- Do not change the icon, screen file name, or screen content. Tab label only.
- Update any references to `tabs.magazine` to `tabs.learn`. Remove the old key.

**Acceptance:** Tab bar shows "Learn" / "เรียนรู้". Screen content unchanged.

---

## Task 9 — UpgradeModal context messaging

**Why:** [src/components/UpgradeModal.tsx](src/components/UpgradeModal.tsx) currently shows generic "Premium feature" copy. Users don't know *why* they're blocked.

**Do:**
- Add a required `reason` prop:
  ```ts
  type UpgradeReason =
    | { kind: 'auth_quota_exhausted'; used: number; cap: number; windowDays: number }
    | { kind: 'feature_locked'; feature: 'heatmap' | 'ai_qa' | 'bg_removal' }
    | { kind: 'tier_lock'; required: 'standard' | 'pro' | 'premium' };
  ```
- Render a contextual message above the existing CTA. Localized in TH + EN. Examples:
  - `auth_quota_exhausted` → `"Used 3/3 free authentications this 30-day window. Upgrade to continue."` / `"ใช้การตรวจสอบฟรีครบ 3/3 ครั้งใน 30 วันแล้ว อัปเกรดเพื่อใช้ต่อ"`
  - `feature_locked` (heatmap) → `"Heatmap analysis requires Pro tier or higher."` / `"การวิเคราะห์ heatmap ต้องเป็นแพ็กเกจ Pro ขึ้นไป"`
- Update every call site of `UpgradeModal` (grep for `<UpgradeModal`) to pass the correct `reason`.

**Acceptance:** Every UpgradeModal appearance shows specific context, not generic copy. TypeScript fails at compile time if any call site forgets `reason`.

---

## Task 10 — Dynamic exchange rate for all tiers

**Why:** [ResultScreen.tsx:54-57](src/screens/ResultScreen.tsx:54) hardcodes `exchangeRate = 36.5`. Only Pro+ calls `getExchangeRate()`. Free/Standard users see stale prices.

**Do:**
- Remove the hardcoded `36.5` constant.
- Call `getExchangeRate()` on screen mount **for all tiers**. Cache the result in `AsyncStorage` with a 24-hour TTL.
- If the fetch fails AND there's no cached value, show price in USD with a small note: `"Live rate unavailable — showing USD"` / `"อัตราแลกเปลี่ยนไม่พร้อมใช้งาน — แสดงเป็น USD"` (add localization keys).

**Acceptance:** With airplane mode + no cache, result screen shows USD with the unavailable-rate note. With network, all tiers see THB at the live rate.

---

## Task 11 — Granular cost logging (financial-risk fix)

**Why:** [src/screens/LoadingScreen.tsx:716](src/screens/LoadingScreen.tsx:716) is the ONLY call site of `logCostEvent` in the entire codebase. It logs a flat `type: 'scan', costUsd: 0.0060` per scan flow regardless of which sub-operations actually ran. The constants `embedding`, `authenticity`, `deep_search`, `heatmap`, `bg_remove`, `ai_qa` in [src/lib/costBreaker.ts:111-121](src/lib/costBreaker.ts:111) are defined but **never logged anywhere**.

Verified against live data on 2026-05-24: 27 scans logged, $0.108 total, avg $0.004/scan. Real underlying spend (Replicate embeddings ×2 ensemble + Gemini identify + Gemini auth + grounded price search) is estimated at ~$0.078 per non-cache scan → **dashboard under-reports real cost by ~13×**.

This breaks the cost circuit breaker in [supabase/06-cost-circuit-breaker.sql](supabase/06-cost-circuit-breaker.sql): the $60/day budget guard only trips when *logged* spend hits $60, which means real spend can reach ~$780/day before free-tier pause kicks in. That's a P0 financial risk.

**Do:**

- In [src/lib/aiRouter.ts](src/lib/aiRouter.ts), call `logCostEvent` separately at each billable step:
  - After `embedFrontAndBack` returns successfully → `logCostEvent({ type: 'embedding', costUsd: COST_PER_CALL.embedding, ... })`. Log it even if the RAG result is later discarded due to low spread — Replicate already billed.
  - After `identifyWatchGemini` succeeds → `logCostEvent({ type: 'scan', costUsd: COST_PER_CALL.scan, ... })`
  - After `assessAuthenticityGemini` succeeds → `logCostEvent({ type: 'authenticity', costUsd: COST_PER_CALL.authenticity, ... })`
  - After `fetchWatchPricesGemini` succeeds:
    - If the call used grounded search → `type: 'deep_search'`, `costUsd: COST_PER_CALL.deep_search`
    - If plain Gemini (no grounding) → `type: 'scan'`, `costUsd: COST_PER_CALL.scan`
    - Determine which by inspecting how `fetchWatchPricesGemini` is called in [src/lib/geminiAi.ts](src/lib/geminiAi.ts) — look for any `tools: [{ googleSearch: {} }]` or grounding flag. Hard-code the correct event type based on what you find. Do not guess.
- Remove the flat `logCostEvent({ type: 'scan', ... })` call in [src/screens/LoadingScreen.tsx:716](src/screens/LoadingScreen.tsx:716) — it's now double-counted by the per-step logging in aiRouter.
- Cache-hit semantics: only the steps that were actually skipped should log `costUsd: 0`. If only the embedding was cache-hit but Gemini still ran, only the embedding row gets `cacheHit: true, costUsd: 0`. Do not zero out the whole scan.
- Pass through `tier` and `cohortHash` (from `getDataConsent()`) to each call — same metadata shape as the existing call site.

**Do not:**

- Do not add new cost constants. The values in `COST_PER_CALL` are owner-tuned — use them as-is.
- Do not change the `cost_events` schema in [supabase/06-cost-circuit-breaker.sql](supabase/06-cost-circuit-breaker.sql). The new event types fit the existing `event_type TEXT` column.
- Do not change the `daily_budget_usd` config row. Once logging is accurate the owner will re-tune the budget — that's their decision, not yours.

**Acceptance:**

- After one scan flow (non-cache, full path: embed → identify → auth → price-with-grounding), `cost_events` contains 3-4 rows for that scan, not 1.
- Run `npx tsx scripts/calculate-actual-costs.ts` and confirm new event types appear in the breakdown (`EMBEDDING`, `AUTHENTICITY`, `DEEP_SEARCH`, etc.).
- A cache-hit scan still logs the steps that ran, with `cacheHit: true` on the ones served from cache. Total cost for a fully-cached scan should be $0.
- TypeScript `tsc --noEmit` is clean.

---

## Task 12 — Ingest Real DINOv3 Embeddings Pipeline (Critical Security Fix)

**Why:** The database references in the sandbox currently use completely random vectors generated by `Math.random()` in `scripts/ingest-mock-references.ts`. This causes the client-side DINOv3 visual RAG calculations to always fail matching (low similarity ~0.20 and spread ~0.03 < 0.15 threshold), wasting Replicate budget ($0.018/scan) on every scan.

**Do:**
- Build a pipeline script (e.g., `scripts/ingest-real-embeddings.ts`) to ingest real image embeddings for your watch references:
  1. Retrieve all authentic watch reference images from local storage or cloud storage.
  2. Invoke Replicate's DINOv3 model (`1dcb6b130ac6ae0574282178705d0e219526ac6d9276c93eda065dfaacae772f`) on each image.
  3. Extract the 1024-d base embedding vector and slice or project it to the 256-d vector space.
  4. Upsert the real vectors into `public.image_embeddings` (`image_embedding` and `image_embedding_v2`).
- Set a clear production warning that RAG matching should be disabled or will safely fallback/skip until the database embeddings are fully regenerated.

**Acceptance:** `image_embeddings` table contains valid, non-random vectors matching DINOv3 dimensions, allowing actual watch scans to successfully hit the database with high similarity (> 0.90) and high spread (> 0.15).

---

## Out of scope (do not attempt)

- **Moving Gemini API calls to Edge Functions.** Owner needs to design backend tier validation first.
- **Adding backend JWT/tier checks** in `supabase/functions/`. Same reason.
- **RLS policies** for Supabase tables. Same reason.
- **Anti-abuse server enforcement.** Same reason.
- **Key rotation, git history rewrite, force-push.** Owner is doing this manually.
- **Test framework setup.** Owner has not chosen Jest vs Vitest vs anything else.
- **State management refactor** (Context / Redux / Zustand). Out of scope.

---

## When done

- Run `npx tsc --noEmit` — must be clean.
- Run `npx expo start` — must boot without errors on iOS simulator.
- Manually walk through: launch → consent → scan → result → save to collection → PDF export → settings → magazine (now "Learn") tab.
- Report back with: a list of files changed, anything you skipped and why, anything that surprised you.
