# A1 — Real-vs-Fake Authenticity Classifier (watch edition)

**Status: 2026-05-30 — blueprint. Blocker = fake-watch image data only.**

The single biggest authenticity upgrade. A trained binary head over DINOv3
1024-d that outputs an **independent P(real)** — the thing Gemini can't fake and
that retrieval/conformity (A2) can't give. Proven by the sibling amulet app
(songphra): 294 fakes + 4,177 reals → **val AUC 0.967**, and the head trains in
**1.7 seconds** (the cost/time is all in EMBEDDING images, not training).

## What we already have (and what's wrong with it)
- `src/lib/data/authenticity-classifier-weights.{bin,json}` ALREADY exist — but
  they are a **byte-identical copy of songphra's AMULET classifier** (md5 match;
  json notes: real_n 4177 / fake_n 294, trained on พระเครื่อง). **Useless for
  watches** and **not wired to any code**. They serve only as a format placeholder.
- Inference machinery is NOT ported yet (no authenticityClassifier.ts here).
- The DINOv3 embed pipeline IS here: `embed-image` edge returns RAW 1024-d, and
  `embedFrontAndBack()` already computes it per scan (the probe→256 happens later
  in findSimilarWatches). So the classifier can run on the embedding we already make.

## Architecture (copy songphra exactly — do not invent)
```
DINOv3 1024-d (raw, L2-norm)
  → Linear(1024 → 128) → ReLU → Dropout(0.2, train only) → Linear(128 → 1) → Sigmoid
  → P(real) ∈ [0,1]
```
Multi-photo: average P(real) over front/back/macro embeddings (robust vote).
Buckets (from songphra): ≥0.85 real_strong · ≥0.5 real_weak · ≥0.3 fake_weak · <0.3 fake_strong.
Weights file format = `SPAC` binary (magic + dims + fc1.w/fc1.b/fc2.w/fc2.b),
read by the ported authenticityClassifier.ts.

## Pipeline (3 steps; only step 1 is real work)

### 1. Collect fake watch images  ← THE blocker
- Target: **~200-400 labeled fakes** to start (songphra got AUC 0.967 on 294).
- Real class: we ALREADY have ~30k authentic catalog images (the scraped DB) —
  more than enough. Use a balanced subset (~1-2k) so classes aren't 100:1.
- Fake sources (label each by grade/factory when known):
  - r/RepTime, r/RepTimeService — sellers post their reps, often tagged by factory
    (Clean/VSF/BTF). Richest labeled source.
  - Trusted-dealer (TD) galleries — product photos of reps, graded.
  - "Real or fake" forum threads (WatchUSeek, r/Watches) — community-verdicted.
- Legal/ToS: scraping for a commercial product has copyright/ToS exposure. Prefer
  a small research/fair-use set to PROVE the model first; for production, move to
  user-confirmed-fake data (the flywheel) or licensed sets. Document what's dropped.
- Organize: `data/auth-train/real/*.jpg` + `data/auth-train/fake/*.jpg`
  (mirror songphra's `data/fake-test/` layout).

### 2. Embed real + fake → 1024-d features
- Run every image through DINOv3 (the existing `embed-image` edge, or
  `scripts/index_to_image_embeddings.py` pattern). Dump RAW 1024-d (pre-probe).
- Output a manifest: `data/auth-train/features.jsonl` lines of
  `{"embedding": [..1024..], "label": 0|1}` (1=real, 0=fake).
- Cost: ~฿0.30/image × ~1.5k images ≈ ฿450 one-time. ~30-60 min.

### 3. Train + export (`scripts/train_authenticity_classifier.py`)
- Adapted from `scripts/train_probe.py`. Reads features.jsonl, trains the
  1024→128→1 head (BCE, class-weighted since fewer fakes), holds out ~15% for val,
  reports AUC + an fp_table (threshold vs fake-FP vs real-TP), exports
  `authenticity-classifier-weights.{bin,json}` (overwriting the amulet placeholder).
- Runtime: seconds (head only). Re-run freely as the fake set grows.

## Integration (after a watch-trained .bin exists)
1. Drop `authenticityClassifier.ts` from songphra into `src/lib/` (verbatim — the
   .bin asset path already resolves, so Metro won't break).
2. In `aiRouter` (where we already have `ragOutcome.embedding`, the raw 1024-d),
   call `predictAuthenticityMulti([frontEmb, backEmb, ...])` → `pReal` + bucket.
3. Feed `pReal` into the verdict as a REAL signal (it's independent of Gemini):
   blend into `authenticityProbability`, and colour the PhotoHeatmap regions /
   show the bucket. Start in SHADOW (log only) to sanity-check on real scans,
   then promote to the verdict once the held-out AUC + live behaviour look right.
4. Also wire `fakeMatch` (fake-DB) + the fake-vs-real comparison (closer_to_real /
   closer_to_fake) — songphra's `fakeMatch.ts` is portable; populate `fake_embeddings`
   with the embedded fakes from step 2 (currently mock — replace it).

## Honest expectations
- songphra fp_table @ threshold 0.5: catches ~73% of fakes, passes 97% of reals;
  @ 0.8: catches ~91% of fakes, passes 92% of reals. Tunable trade-off.
- **Super-clones (1:1) will still pass** — they're near-identical even at 1024-d.
  The classifier wins on the low/mid-grade majority + gives a calibrated number.
- This is screening, not certification (the existing disclaimers stay).

## Effort summary
| Step | Effort | Who |
|---|---|---|
| Collect ~300 fakes + label | **the real work** (manual/semi-auto, legal care) | data |
| Embed real+fake → 1024-d | ~1 hr, ~฿450 | script (exists-ish) |
| Train + export .bin | seconds | `train_authenticity_classifier.py` (this repo) |
| Port inference + wire verdict | small | code (copy songphra) |
