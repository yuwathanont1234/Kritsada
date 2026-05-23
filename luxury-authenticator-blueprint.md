# Luxury Authenticator App — Blueprint Spec

**Derived from:** ส่องพระ (Songphra) — Thai amulet authenticator
**Target:** AI-powered luxury watch / brand-name bag authenticator
**Audience:** Google Antigravity 2.0 (or any AI code agent)
**Source of truth:** real production codebase at `/Users/kritsada/Desktop/Claude Code Mobile app/songphra` (1.0.0, shipped to Google Play Internal Testing 2026-05-19)
**Author:** Kritsada Yuwathanont (solo founder)
**Document date:** 2026-05-20

> **How to use this file:** Read the **Domain Translation Table** first (§2) — it maps every amulet concept to a watch/bag equivalent. Then everything else applies directly. Almost the entire architecture transfers; only the data model, photo angles, AI prompts, and visual-RAG reference set change.

---

## 0. TL;DR — What you're building

A mobile app (React Native + Expo, Android-first) that lets a user photograph a luxury watch (Rolex, AP, Patek, Omega, etc.) or a brand-name bag (Hermès Birkin/Kelly, Chanel Classic Flap, LV, Gucci, etc.) and returns:

1. **Identification** — brand + model + reference + approximate year
2. **Authenticity verdict** — REAL / SUSPICIOUS / LIKELY FAKE with confidence %
3. **Authentication landmarks** — visual heatmap showing exactly which regions support or contradict the verdict (e.g. on a watch: dial-print, cyclops alignment, crown engraving, caseback finishing; on a bag: stitching, hardware engraving, datecode font, leather grain)
4. **Comparable market price** — estimated resale band, sourced from grounded web search
5. **Knowledge layer** — short article on the model, what to look for, common fake patterns

Monetization: 4-tier subscription (Free / Standard / Pro / Premium) + on-demand credit packs.

Stack: React Native 0.81 + Expo SDK 54 + Supabase (Postgres + pgvector + Storage) + Replicate (DINOv3 / SigLIP visual embeddings + custom classifier) + Google Gemini 2.5 (vision + grounded search) + EAS for build/distribute/OTA.

Solo-founder economics: target ≥85% gross margin at MAX usage per tier, ~฿305K Y1 marketing budget, ~฿7M Y1 net revenue projection in source app (analogous luxury market is 5-10× larger TAM).

---

## 1. Why this blueprint exists

Building the source app (ส่องพระ) took ~6 months of solo-founder iteration across:
- 4 RAG rebuilds (CLIP → DINOv3 base → DINOv3 fine-tune → linear probe)
- 9.7 pricing revisions
- 3 trial models
- 2 marketing-copy legal sweeps
- ~38 Supabase migrations
- Multiple AI vendor pivots (Claude → Gemini-only for cost; Replicate for specialized vision)

Most of those iterations are AVOIDABLE for a clone in a different domain because the architecture is now battle-tested. This spec captures **decisions + their rationale** so you don't re-explore the same dead ends.

**What you SHOULD copy verbatim:**
- Folder layout, navigation pattern, tier-cap matrix shape, scan pipeline stages, EAS profile structure, tester-mode pattern, RLS policy style, working-rules §1-13, OFF-LIMITS legal-copy rules (adapted to luxury), credit-pack v2 pricing logic, A/B framework

**What you MUST re-design per domain:**
- Database table contents (amulets → watches/bags)
- Reference embedding set (15K Thai amulets → ~50K watches + ~30K bags from public sources)
- Photo angle template (front/back → dial/caseback/crown/lug; or bag: front/inside/datecode/hardware/stitching)
- AI prompt content (Thai amulet expert persona → certified watchmaker/leather-goods specialist persona)
- Pricing data sources (G-pra/thaprachan → Chrono24/WatchCharts/Bezel for watches; Vestiaire/Rebag/Fashionphile for bags)
- Marketing copy (Thai Buddhist context → luxury aspirational tone, different OFF-LIMITS rules)

---

## 2. Domain Translation Table (the most important table in this doc)

| Amulet concept | Watch equivalent | Bag equivalent |
|---|---|---|
| **Amulet** (พระเครื่อง) | Watch unit | Bag unit |
| **Pim** (พิมพ์ — mold/design variant) | Reference number (e.g. `116610LN`, `5711/1A`) | Model name + size (e.g. `Birkin 25`, `Classic Flap Medium`) |
| **Temple** (วัด — origin temple) | Brand + manufacturer (Rolex SA, Patek Philippe SA) | Maison (Hermès, Chanel) |
| **Monk** (เกจิ — famous monk who blessed) | Master watchmaker / movement family (cal. 3235) | Atelier / craftsman code |
| **Year cast** (year_created) | Production year (decoded from serial) | Datecode year (Hermès Y-stamp, Chanel serial range) |
| **Material** (มวลสาร — powder, metal, clay) | Case material (steel/gold/Pt/ceramic) + dial/movement | Leather type (Togo/Epsom/Box) + hardware (PHW/GHW) |
| **Region / lineage** | Movement origin (Swiss/Japan/German) | Country of manufacture (France/Italy/Spain) |
| **Cert / expert_certs table** | Auction-house certification (Sotheby's, Christie's, Phillips) + RSC service papers | Authentication service records (Real Authentication, Entrupy, brand spa receipts) |
| **Heatmap landmarks** (28 amulets × 8 obs each) | Per-reference authentication points: dial print at 6 o'clock, cyclops magnification, crown engraving depth, caseback laser, rehaut serial, movement decoration | Per-model points: stitching count + lean, hardware engraving font, datecode position, leather grain pattern, lining stitch, zipper pull |
| **OFF-LIMITS rule 1: no human-expert comparisons** | DON'T say "as accurate as a Rolex AD watchmaker" | DON'T say "as accurate as a Chanel boutique authenticator" |
| **OFF-LIMITS rule 2: no "ฐานข้อมูล/database/X items" count** | DON'T disclose reference set size (IP risk from auction houses + Chrono24 ToS) | DON'T disclose datecode database (Hermès actively litigates) |
| **Marketing AI count** (2/4/7/12) | Same ratio: Free=2 / Std=4 / Pro=7 / Premium=12 (or rename to "checks per scan") | Same |
| **Phra Somdej dichotomy** (วัดระฆัง vs บางขุนพรหม vs เกศไชโย — back-side รอยจาร is key) | Submariner reference dichotomy (`116610LN` vs `126610LN` — case-side proportion is key) | Birkin 25 vs Kelly 25 (handle + closure flap is key) |
| **G-pra / thaprachan / web-pra** (Thai marketplaces) | Chrono24, WatchCharts, Bezel, Hodinkee Shop | Vestiaire Collective, Rebag, Fashionphile, The RealReal, StockX (handbags) |
| **Phase 4b COIN embedding ฿190** | Add chronograph-specific embedding (Daytona/Speedmaster) | Add hardware-detail embedding (turn-lock, padlock) |

**Photo-angle template** (replaces "front/back" amulet template):

| Tier | Watch angles | Bag angles |
|---|---|---|
| Free (1 photo) | Dial straight-on | Front straight-on |
| Standard (2 photos) | + Caseback straight-on | + Datecode/serial close-up |
| Pro (3 photos) | + Crown + bezel macro at 45° | + Hardware engraving macro + interior label |
| Premium (4 photos) | + Movement (if exhibition back) or lug profile | + Stitching detail + corner wear / sole condition |

---

## 3. Tech Stack (with reasoning — copy verbatim)

### Mobile app
- **React Native 0.81.5 + React 19.1** — same JS surface, latest Hermes engine, fast
- **Expo SDK 54** — bare workflow with config plugins (NOT managed). Native flexibility when needed but EAS managed builds.
- **TypeScript ~5.9** with `--noEmit` as the sanity gate (no `npm test` yet — see Lessons)
- **Navigation:** `@react-navigation/native` v7 + native-stack + bottom-tabs
- **State:** AsyncStorage for persistence + React Context for runtime; NO Redux/Zustand/Jotai needed at this scale
- **Camera:** `expo-camera` (NOT react-native-vision-camera — Expo's official is enough, less native debugging)
- **Audio:** `expo-audio` for article TTS playback with lock-screen support
- **Animations:** built-in `Animated` API + `react-native-svg` for heatmap overlays
- **UI library:** none — hand-rolled with `colors`/`spacing`/`radius` tokens in `src/lib/theme.ts`

### Backend
- **Supabase** as the single backend:
  - Postgres 17 + pgvector (HNSW indexes, NOT IVFFlat — see §11 lesson)
  - PostgREST for thin CRUD
  - RPC functions for complex queries (`match_amulets_v2`, `admin_*`)
  - Auth (anonymous + email + Google — anonymous is the dominant path)
  - Storage for image uploads (with signed URLs)
  - Edge Functions only when you genuinely need server-side secret access (rare — keep ~all logic client-side)
- **NO custom backend server.** Everything is client-direct-to-Supabase with RLS.

### AI services
- **Google Gemini 2.5 Flash + Pro** — primary vision + reasoning + grounded search
  - Flash for cheap identification + Q&A (thinking off for cost)
  - Pro 2.5 for auth verdict (thinking on for accuracy when needed)
  - Grounded Search ($0.50-1/call) for price refresh — Pro+ tiers only
  - Implicit prompt caching is automatic — no code needed
- **Replicate** for specialized vision models:
  - `nateraw/dinov3-vit-l-384` (or your domain's equivalent) — image embeddings, 1024d
  - Custom linear-probe head trained on triplets — 256d projected embedding
  - Background-removal (`851-labs/background-remover` or `cjwbw/rembg`)
  - Auth-classifier: binary REAL/FAKE classifier (logistic head on DINOv3 features) — trained on ~5K positive/negative pairs from auction-cert vs known-fake images
- **DO NOT use Claude API for primary path** — was tried, Premium cost ~3x Gemini-Pro, accuracy similar. Keep Claude only for a Premium "second opinion" fallback if margin allows.

### Distribution & ops
- **EAS Build** for AAB + APK (Android-first, iOS later)
- **EAS Update** for OTA JS patches (saves 13 min full rebuild per fix)
- **EAS Submit** for Play Console upload
- **GitHub Actions** for nightly cron (price refresh, weekly tester digest, brand-consistency check)
- **GitHub** for code hosting (private repo)
- **ntfy.sh** for push notifications to founder phone (free, no account)

### Cost stack (per active user / month — solo Thailand baseline)
- Supabase: ฿1,200/mo for Pro plan (8GB DB + 100GB egress + larger compute)
- Replicate: ~฿0.04-0.30 per scan (mostly DINOv3 embed; classifier inference is cheap)
- Gemini: ~฿0.05-2 per scan depending on tier (Flash thinking-off is ฿0.05, Pro grounded is ฿2)
- EAS: free up to 30 builds/mo; ~฿500/mo if you upgrade
- Domain + hosting (Vercel for landing page): ฿800/yr
- **Per-tier MAX usage cost ceiling:** Free ฿2-3 lifetime / Std ฿12.60/mo / Pro ฿55/mo / Premium ฿180/mo

### Tools NOT to use (learned the hard way)
- ❌ CLIP for visual RAG — collapses cluster centroids for same-class items, fine for general image retrieval but bad for fine-grained authenticity
- ❌ IVFFlat pgvector index at scale > 10K rows (recall drops; HNSW is mandatory)
- ❌ Wise (Thailand) for receiving USD payouts — auto-converts to THB on receipt as of 2026-05-19 (BOT regulation). Use Bangkok Bank FCD USD account instead.
- ❌ Payoneer — 4.5% effective FX
- ❌ "Hide in production" comments without an actual `__DEV__` gate (see Lesson §11.1)
- ❌ `cli.appVersionSource: "remote"` without `autoIncrement: true` on every profile (see Lesson §11.2)
- ❌ Custom backend server in Node/Go — overengineering at this stage; Supabase is enough until 100K MAU

---

## 4. App Architecture

### Folder layout (mirror exactly — `src/` is the truth)

```
src/
  components/
    visualization/         # SVG heatmap overlays, accuracy bar charts, collection sets
    *.tsx                  # shared UI: Section, QuotaWallModal, PaywallSheet, etc.
  lib/
    ai.ts                  # main scan orchestrator
    aiHeatmap.ts           # authenticity heatmap pipeline
    aiQA.ts + aiQACache.ts # Q&A endpoint + FAQ cache
    aiRouter.ts            # model/tier dispatch
    auth.ts                # membership tier + trial state
    authenticityClassifier.ts  # binary REAL/FAKE classifier client
    bboxCrop.ts            # AI-suggested bbox → image crop
    bgremove.ts            # Replicate background removal
    costBreaker.ts         # cost circuit-breaker per user
    experiments.ts         # A/B test framework
    fakeMatch.ts           # nearest-neighbor against known-fakes
    feedback.ts            # tester/user feedback submission
    geminiAi.ts            # Gemini SDK wrapper
    geographicMap.ts       # provenance map data
    linearProbe.ts         # local matmul for 256d projection (no network)
    matchConfidence.ts     # confidence aggregation across signals
    multiModelVote.ts      # ensemble voting
    priceCache.ts          # 7-day price cache
    prompts.ts             # ALL Gemini/Claude prompts here
    qaGuards.ts            # topic guards (4-layer defense)
    scanAnalytics.ts       # telemetry for scans
    scanPreflight.ts       # camera quality / blur / dark gate
    storage.ts             # AsyncStorage keys + helpers
    supabase.ts            # client + typed helpers
    testerMode.ts          # tester-build special distribution
    theme.ts               # colors, spacing, radius tokens
    tier.ts                # ⭐ tier capability matrix (single source of truth)
    types.ts               # shared TypeScript types
    visualRag.ts           # client of match_amulets_v2 RPC
    userRefImages.ts       # user-uploaded reference photos
  screens/                 # 33 screens (see list below)
plugins/
  withTabletSupport.js     # config plugin — required="false" on camera uses-feature
scripts/                   # ~80 npm scripts for data ingestion + ops
supabase/
  schema.sql               # canonical schema
  NN-feature.sql           # numbered migrations (in apply order)
docs/                      # legal, marketing, financial, tester guides
assets/                    # icons, splash, fonts
app.json                   # Expo config
eas.json                   # build profiles (see §10)
scripts/validate-eas.js    # pre-build schema check (see Lesson §11.2)
```

### Screen inventory (33 screens — map to your domain)

**Universal (keep as-is):**
- SplashScreen, LoginScreen, HomeScreen, SettingsScreen, ProfileScreen, ManageAccountScreen, PrivacySettingsScreen, MembershipScreen, SubscriptionScreen, InfoScreen, ErrorReportScreen, DeviceInfoScreen, ImageCreditsScreen

**Scan pipeline:**
- ScanScreen — multi-photo capture w/ overlay frames
- CaptureScreen — single-photo with quality preflight (blur/dark/angle)
- LoadingScreen — staged progress UI (identify → auth → heatmap → price)
- ResultScreen — verdict + heatmap + price + Q&A entry
- ResultDetailScreen — drill-down per signal
- RefCompareScreen — side-by-side cert photo vs scan

**Knowledge layer:**
- ArticlesScreen, ArticleDetailScreen (with audio playback)
- AuthGuideListScreen, AuthGuideScreen (how-to-spot-fake guides)
- NewsScreen (weekly auto-published market news)

**Collection & game:**
- CollectionScreen, CollectionGoalsScreen — user's saved items + completion sets
- PortfolioScreen — net-worth tracker, P&L
- GameScreen — gamified learning (optional)

**Q&A:**
- AIQAScreen — chat with AI specialist

**Admin (DEV-only, see Lesson §11.1):**
- AdminDashboardScreen — analytics, cost monitor, tester events

### Navigation pattern
- Root: native-stack (auth-state-aware: Splash → Login → MainTabs OR Splash → MainTabs if cached)
- MainTabs: bottom-tabs with [Home, Scan, Collection, Learn, Settings]
- Modals: PaywallSheet, QuotaWallModal, RestrictedTopicModal, AutoClassifyPromptModal

---

## 5. AI Pipeline (the core competitive moat)

### Scan pipeline V3.2 (hierarchical, RAG-first)

```
USER opens ScanScreen
  ├─ prewarmReplicate() fires in background (cold-start kill — saves 60-80s)
  └─ Camera ready with 5:7 portrait frame overlay (for watches: square 1:1)

USER captures photos (template count = tier.templatePhotoCount)
  ├─ scanPreflight: blur detection + brightness + angle check
  ├─ if any fail → friendly error "ถ่ายใหม่: ภาพเบลอ" before LLM call ($ saved)
  └─ upload to Supabase Storage (resized client-side: Free 600px / Std 800px / Pro+ 1024px)

PIPELINE STAGE 1 — Identify (fast, ~3-8s)
  ├─ Gemini Flash thinking-off (~฿0.05) with vision input
  ├─ Prompt: "What is this watch? Return JSON: { brand, reference, year_est, confidence }"
  ├─ ALSO: bbox detection of the subject for auto-crop hero image
  ├─ ALSO: 3-way ID via visual RAG against cert exemplars
  │   └─ match_amulets_v2 RPC (HNSW cosine, top-5)
  │   └─ if RAG top-1 disagrees with Gemini → conf -= 15
  └─ UI updates: name, ref, year — user sees this BEFORE auth runs

PIPELINE STAGE 2 — Auth button shown (tier-gated)
  USER taps "Authenticate" → cost is opt-in
  ├─ Pre-fire: heatmap (Standard+) for landmark signals (~฿0.15)
  ├─ Run: authenticityClassifier on 1024d DINOv3 embedding (Replicate)
  │   └─ Binary REAL/FAKE prob + confidence
  ├─ Cross-validate: nearest-neighbor against fake_embeddings table
  │   └─ if distance < 0.30 → strong FAKE signal
  ├─ Statistical anomaly: is RAG distance outside cert-verified distribution?
  ├─ Multi-photo voting: if Premium 4-photo, weighted ensemble across angles
  ├─ Gemini Pro 2.5 final synthesis: takes ALL signals → verdict + reasoning
  └─ Verdict displayed: REAL 92% / SUSPICIOUS 68% / LIKELY FAKE 14% etc.

PIPELINE STAGE 3 — Price button shown (Pro+ only)
  USER taps "Refresh price" → grounded search call
  ├─ Check cache (priceCache, 7-day TTL)
  ├─ If miss: Gemini grounded search → real-time Chrono24/WatchCharts scrape via Google
  ├─ Parse to JSONB price_range_usd + price_by_grade
  └─ Cache + display
```

### Why this hierarchical design

1. **Cost amortization** — Identify is cheap and runs always; Auth and Price are opt-in. ~80% of free-tier scans never trigger Auth → cost stays at ฿0.04-0.05.
2. **Perceived latency** — User sees the name in 3-8s; full pipeline takes 20-30s but they're already engaged.
3. **Upsell hooks** — Free user can run Auth but without heatmap signals → lower confidence → "upgrade for Premium Heatmap" upsell visible at the natural moment.

### Embeddings strategy

- **Primary:** DINOv3-ViT-L 1024d via Replicate (used for KNN search + classifier input)
- **Projected:** 256d via local linear probe (no network — pure JS matmul against a ~1024×256 weight matrix loaded once)
- **Storage:** pgvector `vector(1024)` for `image_embedding`, `vector(256)` for `image_embedding_v2`
- **Index:** HNSW on both (`USING hnsw (col vector_cosine_ops)`)
- **Server-side match:** RPC function `match_amulets_v2(query_vec, threshold, count)` returns top-K with cosine distance. NEVER do client-side cosine over 10K+ rows — was 11.9s/50MB, RPC is 200ms.

### Training pipeline (for the auth classifier)

1. Collect ~5K REAL examples from auction houses + brand spa cert photos
2. Collect ~5K KNOWN FAKE examples from r/RepTime, replica-watch forums, customs seizures
3. Embed all with DINOv3
4. Train logistic regression head (sklearn or Replicate fine-tune) on 1024d → P(real)
5. Validate AUC > 0.95 (source app hit 0.9668)
6. Export weights → ship in `src/lib/data/authClassifierWeights.bin`
7. Local inference: pure JS matmul + sigmoid (no network!)

### Prompt library — keep ALL prompts in one file

`src/lib/prompts.ts` — single source of truth. Versioned. Tested via smoke-test suite.

For luxury watches/bags, your prompts must:
- Set persona as "certified watchmaker / leather-goods specialist with NO affiliation to brand or seller"
- Refuse investment advice (legal risk)
- Refuse price predictions for specific items (only ranges with disclaimer)
- Always return JSON in a fixed schema (with trailing-comma repair on parse failure — Gemini has this bug)
- Set max output 16K tokens (8K truncation bug was real)

---

## 6. Tier System & Pricing (CRITICAL — get this right or kill margin)

### Source of truth: `src/lib/tier.ts`

A single `TierCapabilities` TypeScript type with ~25 fields. Per-tier const (FREE_CAPS, STANDARD_CAPS, PRO_CAPS, PREMIUM_CAPS). Everything else reads from `tierCaps(tier)`.

### Pricing template (adjust for luxury TAM — likely 2-3× higher prices justified)

```
Source app (Thai amulets — ฿):
  Free:     ฿0    / 5 scans in 30-day window, then locked
  Standard: ฿249  / 30 scans/mo, auth on all
  Pro:      ฿699  / 80 scans/mo, full auth + priority + 3-photo
  Premium:  ฿1,790/ 200 scans/mo, AI Heatmap + 4-photo + unlimited collection

Luxury watches/bags (USD — start here, adjust by region):
  Free:     $0     / 3 scans lifetime (lower than amulet because each scan is higher-stakes / value)
  Standard: $9.99  / 15 scans/mo, basic auth on all
  Pro:      $24.99 / 50 scans/mo, full auth + priority + 3-photo
  Premium:  $79.99 / 150 scans/mo, AI Heatmap + 4-photo + reseller marketplace integration

Annual: 15% discount, marketed as "2 months free"
```

### Hard rules (DO NOT BREAK)

1. **NO unlimited anywhere.** Every cap is a finite number. Even Premium scans = 200/mo not "unlimited". Cost runaway is the #1 risk.
2. **MAX margin must stay ≥ 85%** at full tier usage. Re-compute when changing prices.
3. **Apple/Google take 15-30%.** Subscribe-only items are 15% after first year; 30% in some regions. Bake into margin math.
4. **Free is a funnel not a product.** Hard window (30-day) that LOCKS permanently. No infinite renewals.
5. **Trial = card-required (Google Play / Apple).** Not no-card auto-trial — abuse risk is real.
6. **Tier vs Trial gating:** when gating expensive paths, use `tier === 'free' && !isTrialing` — Trial users keep tier='free' but `isTrialing=true`. Gating them as Free silently disables features they're paying for.
7. **Credit Pack v2** (tier-inheriting): 3 SKUs at 20/50/100 credits, ฿299/599/999 (or $9/19/29). Free + trial users CANNOT buy (anti-abuse). Surfaced ONLY via QuotaWallModal — never advertised. Margin 91-96%.

### Cost telemetry (every paid path must log cost)

Every Replicate / Gemini grounded call writes a `scan_events` row with:
- `user_id`, `tier`, `event_type`, `path_taken`
- `cost_thb` (computed at call time from vendor pricing)
- `latency_ms`, `model_used`, `prompt_tokens`, `output_tokens`
- `verdict`, `confidence`, `flagged_anomaly`

Build the `admin_stats_rpc` to slice this by tier × week. This is your margin dashboard.

---

## 7. Database Schema (38 migrations distilled to essentials)

```
amulets / [items]               -- main catalog (watches or bags)
  id uuid PK
  brand text
  reference text                -- "116610LN" / "Birkin 25"
  full_name text
  year_min int, year_max int
  material text                 -- "904L steel" / "Togo leather"
  origin_country text
  description text
  cover_image_url text
  popularity_score float        -- rolling MV refreshed nightly
  created_at timestamptz, updated_at timestamptz

image_embeddings                -- per-image vectors (multiple images per item)
  amulet_id uuid FK
  image_url text
  image_embedding vector(1024)  -- DINOv3
  image_embedding_v2 vector(256)-- linear probe projection
  embedding_source text         -- "cert" / "ref" / "user" / "fake"
  HNSW index on both vectors

expert_certs / [auction_certs]  -- structured "cert spine" for RAG
  amulet_id uuid FK
  cert_authority text           -- "Sotheby's" / "Real Authentication"
  cert_year int
  cert_image_url text
  cert_image_embedding vector(1024)
  notes text                    -- "stamp visible on caseback at 6 o'clock"

fake_embeddings                 -- known-fakes nearest-neighbor table
  source_url text               -- where the fake came from (r/RepTime, customs etc.)
  image_url text
  embedding vector(1024)
  fake_signal_notes text        -- "wrong cyclops magnification — 2.0x instead of 2.5x"

heatmap_annotations             -- per-reference auth landmarks
  amulet_id uuid FK
  region_name text              -- "cyclops alignment" / "datecode position"
  bbox jsonb                    -- {x, y, w, h} normalized 0-1
  signal_polarity text          -- "supports_real" / "supports_fake"
  importance_score int          -- 1-10
  notes text

knowledge_chunks                -- RAG text source (books, articles, forum posts)
  source_id text
  chunk_index int
  content text
  embedding vector(1024)        -- text embedding (not image!)
  metadata jsonb

articles                        -- editorial content
  slug text PK
  title text
  body_md text
  cover_image_url text
  audio_url text                -- auto-generated TTS
  published_at timestamptz
  tier_gate text                -- "free" / "standard" / "pro" / "premium" (free-tap-daily allowed)

scan_events                     -- telemetry + cost
  id uuid PK
  user_id text
  tier text
  event_type text
  path_taken text
  cost_thb numeric
  latency_ms int
  model_used text
  prompt_tokens int
  output_tokens int
  payload jsonb                 -- all the rich data
  created_at timestamptz

tester_events                   -- separate from scan_events (tester telemetry isolated)
  device_id text                -- "t-<base36 ts>-<random>" (CAUTION: race condition — see Lesson §11.5)
  event_type text
  platform text
  app_version text
  payload jsonb
  created_at timestamptz

tester_feedback                 -- in-app feedback button
  device_id text
  message text
  category text                 -- "bug" / "ux" / "feature" / "general"
  platform, app_version
  created_at

price_cache                     -- 7-day shared cache
  cache_key text PK             -- composite: brand + reference + year_band
  price_range_usd jsonb         -- {min, max, median, currency}
  price_by_grade jsonb          -- {"NOS": {...}, "Mint": {...}, "Used": {...}}
  sources jsonb                 -- ["chrono24.com/listing/XXX", ...]
  refreshed_at timestamptz

qa_blocked_events               -- topic guard analytics (legal-relevant)
  user_id, tier, query text, block_reason text, ts

exp_paywall_accuracy_results    -- A/B test view
  experiment_id, variant, outcome, count

```

### RLS strategy (security)
- Most tables: `SELECT` for anon role with row-level filters (e.g. `published_at IS NOT NULL`)
- Write-heavy tables (`scan_events`, `tester_events`, `tester_feedback`): `INSERT` allowed for anon, NO `SELECT` for anon (only service_role)
- `match_amulets_v2` RPC: `SECURITY INVOKER` (default), checks via RLS — DO NOT use `SECURITY DEFINER` views (Security Advisor flags this; we fixed in migration 26)

### Schema migration discipline
- Numbered files: `01-base.sql` ... `35-production-tables.sql`
- Apply via Supabase Dashboard SQL Editor (CLI not linked in source app — see Lesson §11.6)
- For column-shape changes: DROP + CREATE if `ALTER` errors 42P16 (catch-22 with views)
- Embed verify queries as SQL comments at end of migration

---

## 8. Key Lessons Learned (READ THIS — saves you weeks)

### 11.1 The DEV-leak class of bug

**Symptom:** A "Dev / admin / debug" UI element ships to production users despite a comment saying "hidden in prod".

**Root cause:** Comments are not code. If you write:
```tsx
{/* Hidden in production */}
<View style={styles.devSwitcher}>...</View>
```
the UI ships. The fix is an actual gate:
```tsx
{__DEV__ && (
  <View style={styles.devSwitcher}>...</View>
)}
```
`__DEV__` is React Native's compile-time constant. False in any release build. Tree-shaken out of the bundle.

**Working rule:** before uploading any AAB/APK, do a 60-second smoke test (install on emulator, open Settings + Home + Profile, scan for any "test/debug/placeholder" text). See working_rules §12 in source repo.

### 11.2 EAS versionCode collision

**Symptom:** Play Store rejects upload "version code N already used".

**Root cause:** `cli.appVersionSource: "remote"` in `eas.json` does NOT auto-bump versionCode. Each profile must declare `"autoIncrement": true` (boolean — NOT the string "versionCode" which was a separate schema bug).

**Fix:** ship the `scripts/validate-eas.js` from source repo. Runs before any build via `npm run eas:build:*` wrappers.

### 11.3 Replicate cold-start hides as "slow scan"

**Symptom:** First scan after app launch takes 60-80s. User thinks the AI is slow. They churn.

**Root cause:** Replicate model containers cold-start. Subsequent calls within ~5 min are warm.

**Fix:** `prewarmReplicate()` called from HomeScreen + ScanScreen mount → fires a dummy 1×1 px embed request → keeps container warm. Plus per-site Promise.race timeouts (8/12/15s) so any one Replicate call can't lock the pipeline.

### 11.4 EAS auto-mode classifier blocks env push

**Symptom:** AI coding assistants (Claude Code, etc.) get blocked when running `eas env:push production` even with user approval.

**Root cause:** classifier flags anything modifying production systems.

**Workaround:** wrap as npm scripts (`npm run eas:env:push:production`). User runs it in their own terminal. See working_rules §13.

### 11.5 Tester device_id race condition

**Symptom:** Each physical tester device produces 2 `device_id` rows in `tester_events` — analytics counts 2× actual testers.

**Root cause:** `getOrCreateDeviceId()` is called concurrently on first launch by `activateTesterModeIfNeeded()` and `app_open` event handler. Both see AsyncStorage cache miss → both generate IDs → both write (last wins in storage, but both already fired events).

**Fix:** module-level in-flight Promise singleton:
```ts
let pending: Promise<string> | null = null;
export async function getOrCreateDeviceId() {
  if (pending) return pending;
  pending = doCreate();
  return pending;
}
```

### 11.6 Supabase CLI may not be linked

**Symptom:** `supabase db push` fails. No `exec_sql` RPC available.

**Fix:** treat Supabase Dashboard SQL Editor as the deployment surface. Migrations live as numbered `.sql` files but apply via copy-paste. Document this in onboarding.

### 11.7 Memory file size cap matters for AI agents

**Symptom:** `MEMORY.md` grows past ~24KB → every agent turn reads more context → slower + more expensive.

**Fix:** soft cap 24.4KB. Run `consolidate-memory` skill weekly. Move detailed session notes into separate files indexed by MEMORY.md.

### 11.8 Visual audit > automated for image bugs

**Symptom:** Layout / brand-pillar / image-aspect bugs slip past `tsc --noEmit` and unit tests.

**Fix:** for any UI commit, screenshot the affected screen + visually diff. Source app caught 19 misses this way in Day 1 infrastructure session.

### 11.9 OFF-LIMITS marketing copy (legal risk)

**Source app rules (luxury equivalents in parentheses):**
1. **No human-expert comparisons.** Don't say "as good as a watchmaker" or "more accurate than an AD" — slander/expert-status risk + Apple AI guidelines.
2. **No reference-set count disclosure.** Don't say "60,000 references" or "trained on 50,000 watches". IP and ToS risk from sources (Chrono24, auction houses).
3. **No specific brand IP claims.** Don't use brand logos in app icon. Use generic "luxury watch" / "designer bag" silhouettes.
4. **Use neutral framing** — "AI checks 12 signals" not "AI authentication expert".

### 11.10 Cost-leak audit before launch

**Pattern:** every paid feature gets a leak audit before public launch.

**Source app result (commit `c2ddc5b`):** 1 CRITICAL leak (Premium heatmap uncapped, ฿200/mo abuse risk) + 5 gaps. All plugged with new `check<Feature>Allowed` + `increment<Feature>` patterns in tier.ts.

Replicate this for luxury app's expensive paths: full-resolution embedding, grounded price search, heatmap generation, multi-angle ensemble.

### 11.11 Trial vs Tier gating bug

```ts
// ❌ Wrong — gates trial users out of features they're paying for
if (tier === 'free') return false;

// ✅ Right — Trial users have tier='free' + isTrialing=true
if (tier === 'free' && !isTrialing) return false;
```

### 11.12 Solo-founder banking truths (Thailand-specific — adapt to your country)

- Bangkok Bank FCD USD for receiving Google Play USD payouts (NY branch direct, no $15-20 intermediary fee)
- Bangkok Bank Travel Card 0% FX for paying Replicate/Gemini/Claude
- Wise Thailand auto-converts USD → THB on receipt (effective 2026-05-19) — DON'T use for receiving foreign payouts
- VAT registration mandatory at ฿1.8M/yr revenue
- Use Personal Google Payment Profile (not Business) until incorporated — Business requires company registration

(US/EU founders: Stripe for cards + Wise Multi-Currency for FX optimization is the equivalent stack.)

### 11.13 EAS schema cleanliness

Every profile in `eas.json` MUST have:
- `autoIncrement: true` (boolean!) if `cli.appVersionSource: "remote"`
- `channel` declared (OTAs target it)
- `environment` set ("production" / "preview")
- `env.EXPO_PUBLIC_TESTER_BUILD = "true"` ONLY on tester profiles
- `env.EXPO_PUBLIC_TESTER_BUILD` MUST be unset on production (re-enables DEV section otherwise)

Validator: `scripts/validate-eas.js` from source repo. Copy verbatim.

---

## 9. Distribution: EAS Profile Template

```jsonc
{
  "cli": {
    "version": ">= 18.0.0",
    "appVersionSource": "remote"  // EAS owns versionCode/buildNumber
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "autoIncrement": true,
      "android": { "buildType": "apk" },
      "channel": "preview",
      "environment": "preview"
    },
    "tester": {
      // Legacy LINE-distributed APK for trusted friends
      "distribution": "internal",
      "autoIncrement": true,
      "android": { "buildType": "apk" },
      "channel": "tester",
      "environment": "preview",
      "env": {
        "EXPO_PUBLIC_TESTER_BUILD": "true",
        "EXPO_PUBLIC_TESTER_END_DATE": "2026-06-14T16:59:59Z"  // hard self-lockout
      }
    },
    "tester-store": {
      // Internal Testing track on Play Store (AAB)
      "distribution": "internal",
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" },
      "channel": "tester-store",
      "environment": "preview",
      "env": {
        "EXPO_PUBLIC_TESTER_BUILD": "true",
        "EXPO_PUBLIC_TESTER_END_DATE": "2026-05-31T16:59:59Z"
      }
    },
    "production": {
      "autoIncrement": true,
      "channel": "production",
      "environment": "production"
      // NO EXPO_PUBLIC_TESTER_BUILD — production must not enable tester mode
    }
  },
  "submit": {
    "production": {}  // configure service account JSON for auto-submit
  }
}
```

### Phase-1 launch plan (Day 0 → Day 12)

| Day | Milestone |
|---|---|
| **Day 0** | Repo init, Supabase project, EAS account |
| **Day 1-3** | Schema + data ingest pipeline (collect 30K+ watch/bag references) |
| **Day 4-6** | AI pipeline integration (Gemini + Replicate + classifier training) |
| **Day 7** | First tester-store AAB → Play Console Internal Testing (~12 testers) |
| **Day 8-9** | Marketing assets (landing page, social handles, 9 short videos) |
| **Day 10-13** | Closed Testing 14-day window opens (Production unlocks at end) |
| **Day 14+** | Public soft launch — Production track |

---

## 10. Marketing & Legal (PDPA → GDPR/CCPA — adapt)

### Brand identity as single source of truth
`brand-identity.json` at repo root + symlinked into marketing repo. Hash check in CI fails any commit that drifts (`scripts/check-brand-consistency.sh`).

Fields: app name, taglines (primary + community + reseller), color palette, typography, AI count per tier (2/4/7/12), social handles.

### Privacy / consent flow
- On install: minimal data collection notice + 1-tap accept
- On first scan: explicit consent for image storage + AI training (opt-in — refusing still works, image deleted after scan)
- Account deletion: must actually delete (PDPA + Apple App Store requirement). Source app had a "fake delete" bug in MembershipScreen v0.9 — fix before launch.
- Personalized ads: default OFF, opt-in only

### Required documents
- `docs/PRIVACY_POLICY_TH.md` — translate + adapt to your jurisdiction (Thai privacy = PDPA which is GDPR-like)
- `docs/TERMS_OF_SERVICE_TH.md` — same
- AI usage disclosure prominent in onboarding + Settings

### Content moderation (Q&A topic guards — 4-layer)
1. Pre-filter: regex on common forbidden topics (investment advice, specific item value predictions, brand-IP infringement queries)
2. Tier-aware system prompt: "you are NOT a financial advisor"
3. Post-sanitize: strip any output that looks like advice
4. FAQ audit: weekly review of new Q&A → add to forbidden list as needed

Telemetry: `qa_blocked_events` table for legal audit trail.

---

## 11. Marketing Channel Plan (solo-founder, anti-front-load)

Don't burn marketing budget on Day 1. Source app's plan ($305K Y1 → adapt 5-10× for luxury):

| Phase | Months | % of budget | Channels |
|---|---|---|---|
| Cold start | M1-M3 | 15% | Organic + influencer (1-2 micro) + community seed |
| Validation | M4-M6 | 35% | Add Meta/TikTok ads after CAC validated < target |
| Scale | M7-M12 | 50% | Programmatic + creator partnerships |

Thai 2026 benchmarks (replace with your market):
- Meta CPI ฿80-150
- TikTok CPI ฿40-80
- Influencer micro: ฿5K-15K/post (10-50K followers)

Kill criteria: any channel CAC > 2× LTV after 30 days = pause.

Watch/bag specific channels:
- Reddit r/Watches, r/WatchExchange, r/Handbags, r/RepLadies (for understanding fake market)
- Instagram watch/bag enthusiast accounts (Hodinkee, PurseBlog network)
- YouTube watch reviewers (target the 50-200K subscriber tier — affordable + engaged)
- Discord watch / Hermès / Chanel collector servers

---

## 12. Financial Model Template (3 scenarios)

Adjust pricing × conversion rate × churn × cost. Source app figures:

```
Conservative:  100K installs Y1, 2% paid, ARPU ฿400/mo → ฿9.6M revenue
Base case:     250K installs Y1, 3% paid, ARPU ฿500/mo → ฿37.5M revenue  
Bull:          800K installs Y1, 4% paid, ARPU ฿600/mo → ฿192M revenue
```

For luxury watches/bags, the TAM is much larger but conversion to paid may be lower (audience is more skeptical of AI). Net revenue could be similar at lower install volume but higher ARPU.

Build a working spreadsheet at `docs/FINANCIAL_PROJECTION_v1.xlsx`. Update monthly.

### Break-even calc
- M1-M3: data-ingest + ad seed (loss)
- M3-M4: first VAT registration (~$50K revenue threshold equivalent)
- M3-M6: break-even
- M6+: net positive, reinvest

### Tax / accounting (Thailand-specific — adapt)
- Solo founder = personal income tax ม.40(8) (business/professional)
- Flat 60% deduction OR actual expenses with receipts
- VAT 0% on "export of service" (Google Play = export) but MUST register and file monthly ภพ.30
- Hire freelance CPA ฿2-5K/mo before first settlement

(US: LLC + Schedule C or S-Corp pass-through. EU: VAT-MOSS for digital services. Adapt.)

---

## 13. Cron / Automation (GitHub Actions)

Source app's nightly jobs (copy + adapt):

| Job | Cron | Purpose |
|---|---|---|
| `prices:refresh:tier1` | `0 3 * * *` (03:00 UTC) | Refresh top-100 popular item prices, rotating Tier-2 batch |
| `brand-consistency-check` | `0 19 * * *` (02:00 BKK) | Hash brand-identity.json across repos; fail CI on drift |
| `feedback:report` | `0 6 * * 1` (Mon 13:00 BKK) | Weekly tester digest → ntfy + repo commit |
| `news:publish` | `0 23 * * 5` (Sat 06:00 BKK) | Auto-publish 7-item weekly news + monthly long-form article |
| `discover:weekly` | `0 0 * * 6` (Sun 07:00 BKK) | Auto-discover new references (≥5 items added/week) |
| `audio:gen` | on article publish | Edge TTS → MP3 → Supabase Storage |

All cron output is idempotent (safe to re-run). Failure notifications go to ntfy after 08:00 BKK (don't wake the founder).

---

## 14. What to build FIRST (Phase 1 ranked checklist)

If you have 14 days to MVP — do these in order:

1. **Supabase project + schema migrations 01-10** (1 day)
2. **EAS account + bare workflow setup + Hello World AAB** (0.5 day)
3. **Auth (anonymous Supabase) + tier.ts capability matrix** (0.5 day)
4. **Scan pipeline V3.2 with single tier (Free) and minimum signals** (3 days)
5. **Data ingest scripts — collect ~5K watch refs + cert photos + embed** (2 days)
6. **Heatmap basic (1 model, hardcoded landmarks for top-20 references)** (2 days)
7. **Tier 2-3-4 gating + Paywall UI + Credit Pack stubs** (2 days)
8. **Tester-mode build profile + 3 friends test** (1 day)
9. **Marketing 1-page landing + social handles + 3 short videos** (1 day)
10. **Closed Testing → Production track submission** (1 day)

Save these for Phase 2+:
- AI Heatmap UI (Premium feature)
- Q&A topic guards
- Article TTS
- Game / learning modules
- Portfolio tracker
- 4-photo Premium template

---

## 15. Files to copy verbatim from source repo (with path)

```
src/lib/testerMode.ts                  -- tester-build pattern, 100% reusable
src/lib/storage.ts                     -- AsyncStorage helpers + free-window timer
src/lib/theme.ts                       -- design tokens (rename brand colors)
src/lib/experiments.ts                 -- A/B framework, deterministic hashing
src/lib/qaGuards.ts                    -- 4-layer topic defense
src/lib/costBreaker.ts                 -- per-user cost circuit breaker
src/lib/scanResultCache.ts             -- dedup cache
plugins/withTabletSupport.js           -- camera uses-feature optional override
scripts/validate-eas.js                -- pre-build EAS schema check
.github/workflows/*.yml                -- cron job templates
docs/PRIVACY_POLICY_TH.md              -- translate + adapt
docs/TERMS_OF_SERVICE_TH.md            -- translate + adapt
working_rules.md (memory)              -- §1-13 all apply
```

Files to ADAPT (rewrite domain-specific content):

```
src/lib/prompts.ts                     -- all prompts (luxury watchmaker persona)
src/lib/tier.ts                        -- capability matrix (adjust scan caps + price tiers)
src/lib/types.ts                       -- ScanResult shape (rename fields amulet→watch/bag)
src/lib/visualRag.ts                   -- adjust RPC signature if you rename match_amulets_v2
supabase/01-schema.sql ... 35-*.sql    -- rename amulets→watches/bags everywhere
docs/MARKETING_COPY_v*.md              -- redo with luxury OFF-LIMITS rules
docs/FINANCIAL_PROJECTION_v*.md        -- adjust TAM + ARPU + cost
brand-identity.json                    -- new brand
app.json                               -- name, slug, bundleId, icon
```

---

## 16. Source repo links (private — request access from author if needed)

```
github.com/yuwathanont1234/songphra              # main app
github.com/yuwathanont1234/songphra-marketing    # landing + 9 videos
github.com/yuwathanont1234/songrian              # ส่องเหรียญ — Thai coin sibling app (Flutter+Supabase+SigLIP-2)
```

---

## 17. Final sanity checks before you ship

- [ ] All Gemini prompts have JSON schema + trailing-comma repair
- [ ] All Replicate calls have Promise.race timeout
- [ ] All paid features have a cost_thb telemetry row
- [ ] Every tier cap has a hard max number (no `'unlimited'`)
- [ ] Free tier has a 30-day window with permanent lock after expiry
- [ ] `__DEV__` gates all admin/debug UI
- [ ] `EXPO_PUBLIC_TESTER_BUILD` not set on production profile
- [ ] `autoIncrement: true` on every build profile
- [ ] AAB smoke-tested on real device before Play Store upload
- [ ] Privacy policy reflects actual data collection
- [ ] Account deletion actually deletes
- [ ] Q&A topic guards block investment advice
- [ ] Brand identity JSON hash matches across repos
- [ ] Bank account ready to receive USD payouts (FCD or equivalent)
- [ ] CPA / accountant lined up
- [ ] App store screenshots + feature graphic + content rating done

---

## 18. Open questions you'll need to answer

1. **Watches vs bags first?** Watch market is more mature (Chrono24, WatchCharts), reference data more structured. Bag market is more fragmented but counterfeit volume is higher = more demand.
2. **Geo focus?** US/EU has higher ARPU + higher fraud rates = better LTV. Asia (Japan/Korea/SG) has higher density of authentic luxury + active resale market.
3. **B2C vs B2B2C?** Source app is pure B2C. Luxury domain has B2B opportunity (auctioneers, pre-owned retailers) — you could license API access at premium prices.
4. **Auction-house partnership?** Sotheby's / Christie's / Phillips would gain credibility but lose independence positioning ("AI you can trust BECAUSE no brand owns us").
5. **Insurance integration?** Insurers want fraud-detection — high-ARPU B2B vertical worth exploring after MVP.

---

**END OF BLUEPRINT.** Total: ~14,000 words. Hand this to Antigravity 2.0 as the single source of truth. Read §2 (translation table) and §11 (lessons) first.

For any clarification on specific implementation patterns, read the corresponding file in source repo and ask "why was this written this way?" — every non-obvious decision has a rationale in either git history or memory files.

Good luck. Build something that makes the counterfeit market less profitable.
