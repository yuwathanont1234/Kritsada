# Pre-Launch Audit — Luxury Authenticator

> **Scope note:** the audit brief described *"Trainer AI"*, a fitness app with workout timers / Health Connect / body-stats. **This repo is `Luxury Authenticator`** — an AI luxury-watch authenticator (camera scanning, Visual-RAG, subscription IAP, Supabase backend). The fitness-specific checks were mapped to the real equivalents (camera/photo/PII/health-data → watch-image + account PII) or marked **N/A**. No fitness features were invented.
> **Date:** 2026-06-13 · **Commit:** `bb283ddc` (branch `claude/brave-neumann-6fac3f`, == `main`) · **Stack:** Expo SDK 54.0.34, RN 0.81.5, React 19.1.0, new architecture on.
> **Auditor discipline:** every finding cites a real path:line I read. Anything I could not verify from the repo (store-console state, EAS build image, live URLs) is marked **NEEDS MANUAL VERIFICATION** rather than asserted.
> Several of this session's fixes are already live (enforce flags, fail-closed IAP, honest verdicts, bilingual consent, Discord cost-alert) — credited as **RESOLVED** below, not re-raised.

---

## SCORECARD

| # | Domain | Score | Notes |
|---|--------|------:|-------|
| 1 | Architecture & Code Quality | **86 / 100** | Clean post-refactor split, ErrorBoundary at root, `tsc` clean, console stripped in prod. List virtualization missing. |
| 2 | Security | **74 / 100** | No hardcoded secrets, RLS solid, JWT-keyed quotas live. But auth tokens in AsyncStorage (not SecureStore); env-fallback to placeholder project. |
| 3 | Payments & Revenue Leak | **70 / 100** | Server-side enforce flags + ledger LIVE, fail-closed mock purchase, RC-webhook written. But RevenueCat not yet live → **0 % of users can actually pay today.** |
| 4 | Apple App Store Compliance | **48 / 100** | Sign in with Apple **missing** (Google present); iOS 26 SDK build unverified; reviewer cannot self-serve login. |
| 5 | Google Play Compliance | **52 / 100** | **Account deletion is local-only** (policy violation); 16KB / closed-testing unverified; stale storage permission. |
| 6 | UI/UX Quality | **80 / 100** | Strong after this session's honesty/i18n/contrast pass. Vault list not virtualized; tiny fonts; permission strings EN-only. |
| 7 | Performance & Stability | **72 / 100** | Sentry wired but DSN/org may be unset in prod → crash blindness; `.map()` over collections; cold-start ~50 s handled gracefully. |

### Overall launch-readiness (initial audit): **62 %** — 🔴 **NO-GO**

Not a quality problem — the engineering is in good shape. It was a **compliance + go-live-config** problem: four hard blockers (Apple sign-in, server-side account deletion, RevenueCat live, iOS 26 SDK) each independently get the app rejected or unable to earn.

> ### ⏩ POST-REMEDIATION (2026-06-13): the code-level blockers are now fixed in-repo — see the **REMEDIATED** section at the bottom. Remaining to GO are **external/console** items only: RevenueCat go-live, iOS 26 SDK build image, Sentry/Supabase prod env, closed-testing, store privacy forms. Revised readiness once those console steps are done: **GO**.

---

## FIX FIRST — Top 10 blockers in priority order

1. **Implement Sign in with Apple** (Google OAuth present → Apple *requires* it). — `src/screens/OtpScreen.tsx:317`, `src/lib/auth.ts`
2. **Make "Delete Account" actually delete the server account + data** (currently local-only). — `src/screens/SettingsScreen.tsx:301`, `src/lib/dataConsent.ts:143`
3. **Stand up RevenueCat for production** (products + entitlements + keys) — without it, purchases hard-fail and no one can subscribe. — `src/lib/iap.ts:41`, `docs/IAP_SETUP_GUIDE.md`
4. **Verify the iOS build uses the iOS 26 SDK** (EAS image / Xcode 26) before submitting. — `eas.json:46` — *NEEDS MANUAL VERIFICATION*
5. **Confirm Sentry DSN + org are set in the EAS `production` env** (else you launch crash-blind). — `app.json:62`, `src/lib/sentry.ts:31`
6. **Provide a working reviewer login** (demo account or guaranteed-deliverable OTP) for Apple + Google review notes. — `src/screens/OtpScreen.tsx`
7. **Confirm `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` are in the prod build env** (placeholder fallback silently breaks the whole app). — `src/lib/supabase.ts:5`
8. **Virtualize the Vault list** (`FlatList`; today it's `.map()` in a `ScrollView`, Premium = 100 watches + images). — `src/screens/ProfileScreen.tsx:488,635,682`
9. **Drop unused native deps** `expo-speech-recognition`, `expo-speech` (privacy-label + bloat risk). — `package.json:42-43`
10. **Verify Android 16 KB page size + complete the closed-testing requirement** for a new Play account. — *NEEDS MANUAL VERIFICATION*

---

## 🔴 BLOCKERS

### 🔴 — Apple Compliance — Sign in with Apple is missing while Google sign-in ships
- **File:** `src/screens/OtpScreen.tsx:317` (Google button rendered), `src/lib/auth.ts:201` (`signInWithGoogle`); no `expo-apple-authentication` in `package.json`.
- **Problem:** The app offers Google OAuth as a login option but offers no "Sign in with Apple." Apple Guideline 4.8 requires an equivalent privacy-preserving login (Apple sign-in) whenever a third-party social login is offered.
- **Risk:** Deterministic App Store **rejection**.
- **Fix:** Add `expo-apple-authentication`, render the Apple button (iOS only) above Google with equal prominence, exchange the identity token via `supabase.auth.signInWithIdToken({ provider: 'apple', token })`, and add the `usesAppleSignIn` capability in `app.json`. Apple sign-in is not required on Android, so gate the button with `Platform.OS === 'ios'`.
- **Effort:** M

### 🔴 — Google Play Compliance — "Delete Account & All Data" never deletes the account or server data
- **File:** `src/screens/SettingsScreen.tsx:301-311` → `src/lib/dataConsent.ts:143-168` (`eraseMyData` only calls the `delete_my_scan_events` RPC keyed by anonymous cohort hash); the handler then does `AsyncStorage.clear()` and shows success.
- **Problem:** The flow deletes only anonymous analytics rows + local storage. The `auth.users` record, `user_profile`, `user_membership`, the saved Vault/collection, and `user_scan_ledger` all persist server-side. The button is literally labelled "Delete Account & All Data" (`localization.ts:51`) — it does neither.
- **Risk:** Google Play **policy violation / removal** (in-app account deletion must delete the account and its data server-side, or link to a web flow that does). Also a consumer-truthfulness/PDPA problem on a paid app.
- **Fix:** Add a `security definer` Supabase RPC `delete_my_account()` that (under the caller's JWT) deletes the user's rows across all owned tables and calls `auth.admin.deleteUser(auth.uid())` via an edge function, then `supabase.auth.signOut()` and clear local storage. Only show "success" after the server confirms. Keep a published web deletion URL in Play Console as the required backup.
- **Effort:** M

### 🔴 — Payments — RevenueCat is not live, so production purchases hard-fail (no revenue + IAP-broken rejection)
- **File:** `src/lib/iap.ts:41` (`isIapConfigured` returns false with no key), `:282` (prod now hard-fails — correct), `docs/IAP_SETUP_GUIDE.md`.
- **Problem:** This session correctly made `purchaseTier`/`restorePurchases` fail closed in production when RevenueCat keys are absent — but the keys/products/entitlements have not been created yet. Shipping in this state means every "Subscribe" tap returns an error.
- **Risk:** **100 % revenue loss** + Apple/Google reject a paywall whose purchase button doesn't work ("app exhibits bugs").
- **Fix:** Complete the RevenueCat dashboard (3 products `lux_std_990` / `lux_pro_1990` / `lux_premium_4990`, one entitlement each, one "default" offering), create the matching App Store Connect + Play Console subscriptions, set `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS/ANDROID` in the EAS `production` env, wire the `revenuecat-webhook` (already deployed) URL + `RC_WEBHOOK_SECRET`, then flip `TIER_GATE_ENFORCE=true`. Verify a sandbox purchase end-to-end before submission.
- **Effort:** L (mostly console + sandbox testing)

### 🔴 — Apple Compliance — iOS build SDK must be iOS 26 (time-sensitive) — NEEDS MANUAL VERIFICATION
- **File:** `eas.json:46-50` (production profile pins no build image / Xcode version).
- **Problem:** Expo SDK 54 builds on EAS default images (Xcode 16 / iOS 18 SDK) unless an image is pinned. The brief states Apple requires the iOS 26 SDK for new submissions; I cannot confirm the active EAS image from the repo.
- **Risk:** If the deadline is in force, App Store Connect **rejects the binary at upload** regardless of app quality.
- **Fix:** Pin an EAS build image that ships Xcode 26 on the `production` profile (`"image": "latest"` or the specific macOS/Xcode-26 image once available), rebuild, and confirm the upload is accepted. Verify against current Apple developer-news before submitting.
- **Effort:** S (config) — verification required

### 🔴 — Performance/Stability — Sentry may ship disabled in production (crash-blind launch) — NEEDS MANUAL VERIFICATION
- **File:** `src/lib/sentry.ts:31-35` (init is a no-op when `EXPO_PUBLIC_SENTRY_DSN` is unset), `app.json:62-67` (org slug is the placeholder `"your-org-slug"`).
- **Problem:** Crash reporting only activates if the DSN env var is present in the build; the Sentry plugin's `organization` is a placeholder, so source-map upload / release association won't work as configured.
- **Risk:** A launch crash spike (the #1 store-rejection and 1-star driver) would be **invisible** — no stack traces, no alerting.
- **Fix:** Set `EXPO_PUBLIC_SENTRY_DSN` in the EAS `production` env, replace `your-org-slug` with the real Sentry org, add a `SENTRY_AUTH_TOKEN` EAS secret for source maps, and confirm a test crash appears in Sentry from a release build.
- **Effort:** S — verification required

---

## 🟠 HIGH

### 🟠 — Security — Auth session tokens stored in AsyncStorage, not SecureStore
- **File:** `src/lib/supabase.ts:11` (`storage: AsyncStorage`).
- **Problem:** The Supabase access + refresh tokens persist in AsyncStorage (plaintext SQLite/file), readable via device backup extraction or on a rooted/jailbroken device. For an app holding PII (email, watch collection) and gating paid features, this is below bar.
- **Risk:** Token theft → account takeover; weak posture for a payments app under review scrutiny.
- **Fix:** Provide an `expo-secure-store`-backed storage adapter to `createClient` (chunk values to stay under SecureStore's ~2 KB limit, e.g. the community `LargeSecureStore` pattern). Keep AsyncStorage only for non-sensitive prefs.
- **Effort:** M

### 🟠 — Performance — Vault/collection rendered with `.map()` in a ScrollView (no virtualization anywhere in the app)
- **File:** `src/screens/ProfileScreen.tsx:488` (`recentWatches.map`), `:635` (`brandBuckets.map`), `:682` (`drilldownWatches.map`); repo-wide `FlatList`/`FlashList` count = **0**.
- **Problem:** Every watch card (with image) mounts at once inside a ScrollView. Premium users can store 100 watches; brand drill-downs render the full set.
- **Risk:** Jank + high memory on mid-range Android, scroll stutter, possible OOM on large vaults → 1-star reviews.
- **Fix:** Convert the watch grids/lists to `FlatList` with `keyExtractor`, `initialNumToRender`, `windowSize`, and `getItemLayout` where the cell height is fixed; lazy-load/resize thumbnails.
- **Effort:** M

### 🟠 — App Review — Reviewers cannot self-serve login (email-OTP / Google only; `__DEV__` mock is stripped in prod)
- **File:** `src/screens/OtpScreen.tsx:347` (mock login gated behind `__DEV__`); production auth = email OTP + Google.
- **Problem:** An Apple/Google reviewer must receive an email OTP to enter the app; if delivery is slow/blocked or Google OAuth isn't allow-listed for the review device, they're locked out at the first screen.
- **Risk:** Rejection for "could not review / unable to sign in" — a common, avoidable rejection.
- **Fix:** Create a dedicated reviewer account with a static, documented credential path (e.g. a build-flagged demo login, or a mailbox you can read), and put exact steps + credentials in App Store Connect / Play Console review notes. Test it on a clean device.
- **Effort:** S

### 🟠 — Security/Config — Placeholder Supabase fallback silently ships a broken app if env is missing
- **File:** `src/lib/supabase.ts:5-6` (`|| 'https://placeholder-project.supabase.co'` and a placeholder anon key).
- **Problem:** If `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` aren't injected into the `production` build, the app connects to a non-existent project — auth and every scan fail, but the app doesn't crash, so it looks "working but broken."
- **Risk:** A fully launched, fully non-functional app + wasted review cycle.
- **Fix:** In a release build, throw at startup (or render a hard error screen) if the env is the placeholder; add the keys to `scripts/validate-eas.js` production checks.
- **Effort:** S

---

## 🟡 MEDIUM

### 🟡 — Compliance/Bloat — Unused native libraries inflate the bundle and the privacy label
- **File:** `package.json:42-43` (`expo-speech-recognition`, `expo-speech` — both used in **0** source files).
- **Problem:** `expo-speech-recognition` pulls microphone/speech-recognition capabilities; shipping it unused risks an App Privacy / purpose-string mismatch and adds binary weight.
- **Risk:** Privacy-label inconsistency (store scrutiny) + larger download.
- **Fix:** `npm rm expo-speech-recognition expo-speech`, rebuild, re-run the privacy questionnaire.
- **Effort:** S

### 🟡 — Android — Deprecated `READ_EXTERNAL_STORAGE` permission declared on a target-API-35 app
- **File:** `app.json:34`.
- **Problem:** On API 33+ this permission is a no-op; `expo-image-picker` uses the Android Photo Picker (no permission needed). Declaring it invites Data Safety questions for zero benefit.
- **Risk:** Extra Play review friction; misleading permission prompt.
- **Fix:** Remove `android.permission.READ_EXTERNAL_STORAGE`; rely on the Photo Picker. Verify gallery import still works.
- **Effort:** S

### 🟡 — OTA — Static `runtimeVersion: "1.0.0"` risks pushing JS incompatible with native
- **File:** `app.json:84`.
- **Problem:** A hardcoded runtime version means a future native change that isn't manually bumped could receive OTA JS built against different native code.
- **Risk:** OTA-induced crashes on a subset of installs.
- **Fix:** Use `runtimeVersion: { "policy": "appVersion" }` (or `fingerprint`) so native/JS compatibility is enforced automatically.
- **Effort:** S

### 🟡 — Legal — Terms/Privacy hosted on a personal `github.io` path
- **File:** `src/components/AiProcessingConsentModal.tsx:138`, `src/screens/InfoScreen.tsx:16-17`, `src/screens/MembershipScreen.tsx:579-584` → `https://yuwathanont1234.github.io/Kritsada/legal/…`.
- **Problem:** Legal docs for a paid, PII-handling app live on a personal GitHub Pages path. **NEEDS MANUAL VERIFICATION** that both URLs are live, reachable, and current (the FAQ/Terms were just corrected this session).
- **Risk:** A dead/placeholder privacy URL is an automatic rejection on both stores.
- **Fix:** Confirm both pages load, reflect the real data flows (Gemini/Replicate US processing, RevenueCat, PostHog, Sentry), and ideally move to a stable domain before scale.
- **Effort:** S

### 🟡 — iOS — Permission purpose strings are English-only in a Thai-default app; camera string duplicated
- **File:** `app.json:20-21` (EN-only `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription`) and `app.json:48` (a *second* camera string in the `expo-camera` plugin).
- **Problem:** The app defaults to Thai (`localization.ts`), but the OS permission dialogs are English; two different camera rationales are defined.
- **Risk:** Minor review nitpick + worse UX for Thai users at the consent moment.
- **Fix:** Provide bilingual purpose strings (TH primary), and keep a single source of truth for the camera rationale (the plugin value wins — align or remove the infoPlist duplicate).
- **Effort:** S

### 🟡 — Build — `withTabletSupport.js` custom plugin vs `ios.supportsTablet: false`
- **File:** `app.json:17` (`supportsTablet: false`) and `app.json:60` (`./plugins/withTabletSupport.js`).
- **Problem:** A custom tablet-support plugin runs while iOS tablet support is disabled — at best redundant, at worst conflicting Info.plist orientation/scene keys. **NEEDS MANUAL VERIFICATION** of what the plugin writes.
- **Risk:** Inconsistent iPad behavior or an orientation key Apple flags.
- **Fix:** Read the plugin; if it only targets Android tablet layout, rename/scope it; if it's dead, remove it.
- **Effort:** S

---

## 🟢 LOW

- **🟢 UI — Sub-readable font sizes.** 7.5–10 px labels (hotspot/grade text in `ScanScreen`/`PriceCard`) won't survive large system fonts and fail contrast at size. Set a minimum ~12 px for informational text and test with XL Dynamic Type. — **Effort:** M
- **🟢 UX — OTP resend has no cooldown timer surfaced.** `OtpScreen` lets users re-request without a visible countdown; add one to reduce rate-limit confusion. — **Effort:** S
- **🟢 i18n — `toLocaleString()` called without an explicit locale** for currency/number formatting (device-dependent grouping). Pin `'th-TH'`/`'en-US'` to match the UI language. — **Effort:** S
- **🟢 Analytics — Confirm PostHog isn't capturing IDFA** (it shouldn't by default); if it ever does, ATT + `NSUserTrackingUsageDescription` become mandatory. Currently no tracking string is declared, which is correct *only if* no IDFA is read. — **Effort:** S, verify
- **🟢 Notifications — `expo-notifications` remote push** needs an APNs key (iOS) configured in EAS credentials for the re-engagement campaigns to work; local handler is fine. Verify before relying on push. — **Effort:** S, verify

---

## RESOLVED THIS SESSION (verified — not re-raised)

- ✅ Server-side spend enforcement **live** (`SCAN_LEDGER_ENFORCE` / `GLOBAL_CEILING_ENFORCE` = true) + JWT-keyed quotas, all-label metering, `warmOnly` cap deployed.
- ✅ Mock IAP purchase **fails closed in production** (`iap.ts:282`); fake credit packs hidden; fake "card charged" trial copy removed; trial expiry → free.
- ✅ Fabricated "95 % genuine" fallback verdict and placeholder Rolex identity removed → honest `uncertain` (`ResultScreen.tsx:109`, `VerdictHeader.tsx`).
- ✅ PDPA/AI consent modals now bilingual; privacy-primer "photos never leave device" lie corrected; subscription disclosure (auto-renew + Terms/Privacy links) present on the paywall (Apple 3.1.2) and **no external payment links** exist (3.1.1 OK).
- ✅ Discord cost-alert webhook live and end-to-end tested (75 %/100 % thresholds, hourly cron).
- ✅ No hardcoded secrets in tracked source; `dist/` untracked; 5 lib files tracked; `console.*` stripped in prod via babel; `tsc --noEmit` clean; root `ErrorBoundary` present (`App.tsx:217`).
- ✅ In-app account-deletion entry point **exists** (the gap is server-side scope — see Blocker #2, not its absence).

---

## ✅ REMEDIATED (2026-06-13, this session — verified `tsc` clean + deployed)

- **Blocker #1 — Sign in with Apple:** added `expo-apple-authentication` + `expo-crypto`; `signInWithApple()` with SHA-256 nonce → `supabase.auth.signInWithIdToken` (`src/lib/auth.ts`); iOS-only native Apple button rendered above Google (`src/screens/OtpScreen.tsx`); `ios.usesAppleSignIn: true` (`app.json`).
- **Blocker #2 — Server-side account deletion:** new `delete-account` edge function (verifies caller JWT → `admin.deleteUser` + explicit ledger/membership cleanup) — **deployed**, returns 401 unauthenticated. `SettingsScreen.handleClearData` now calls it and **fails loud** (no false "success") before clearing local + `signOut` + routing to Login.
- **HIGH — Vault virtualization:** `ProfileScreen` outer container converted `ScrollView → FlatList` (drill-down rows virtualized; bounded chrome in `ListHeaderComponent`). *(Note: `recent`/brand-trays were already `slice(8)`/`slice(4)`-bounded — the unbounded case was only the single-brand drill-down, now windowed.)*
- **HIGH — Placeholder env:** `supabase.ts` now **throws at startup in release** if the Supabase URL/key is the placeholder; `validate-eas.js` lists the required prod env vars.
- **MEDIUM — Dead deps / stale perms:** removed `expo-speech-recognition` + `expo-speech`; removed Android `READ_EXTERNAL_STORAGE`; `runtimeVersion` → `{policy:"appVersion"}` (valid here — repo is CNG, validator updated); bilingual TH/EN permission purpose strings + camera string de-duplicated.
- **Dropped finding:** `withTabletSupport.js` is correct as-is (Android-only camera-feature optionality so Play doesn't filter tablets) — not an iOS conflict.

### ✅ REMEDIATED — second pass (store-listing batch)

- **HIGH — Token storage → Keychain/Keystore:** added `expo-secure-store` + a chunked `secureStorage` adapter (`src/lib/secureStorage.ts`); `supabase.ts` now persists the session there instead of AsyncStorage. (No production migration — pre-launch.)
- **App-review — Reviewer login (was a guaranteed reject: OTP-only):** added `signInWithPassword` (`auth.ts`) + an opt-in "Sign in with a password" path on the login screen (`OtpScreen.tsx`). Real users keep OTP/Google/Apple; reviewers get a password account. Setup + review-notes in `STORE_LISTING.md`.
- **Analytics — In-app feedback:** "Rate the App" row in Settings via `expo-store-review`.
- **Store content:** `STORE_LISTING.md` — bilingual description, subtitle/short-desc, keywords, promo text, **reviewer demo-account steps + review notes**, and an accurate Data-Safety / App-Privacy mapping to paste into both consoles.

Still open (external/console only): RevenueCat go-live (#3), iOS 26 SDK image (#4), Sentry/Supabase prod env (#5), store assets (screenshots/feature graphic), console forms (Data Safety, content rating), closed testing. Deferred code polish (non-blocking): tiny-font/Dynamic Type sweep.

## NEEDS MANUAL VERIFICATION (cannot determine from the repo)

1. EAS `production` build image / Xcode (iOS 26 SDK) — Blocker #4.
2. Android 16 KB page-size compatibility of native libs (RevenueCat 10.x, Sentry 7.x, react-native-screens) — run the EAS 16 KB check.
3. Closed-testing 12-tester / 14-day completion for a new personal Play account.
4. Play Console **Data Safety** + App Store **Privacy Nutrition Label** match real behavior (Gemini/Replicate/PostHog/Sentry/RevenueCat data flows).
5. `EXPO_PUBLIC_*` keys (Supabase, RevenueCat, Sentry DSN) actually present in the EAS `production` env.
6. Privacy + Terms `github.io` URLs are live and current.
7. APNs key configured in EAS credentials for remote push.
