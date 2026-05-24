# Self-Learning Watch-Scan RAG

A multimodal RAG pipeline that identifies watches from a photo and **grows its
own visual database**: when a user scans a model the DB has never seen, the
system answers instantly from world knowledge, then quietly harvests an
official studio image of that model so the next scan — from anyone, anywhere —
can be matched against a real benchmark vector.

## Two paths

```
            ┌─────────────────────── FAST PATH (synchronous) ───────────────────────┐
user photo ─┤ Gemini + Google Search → brand / model / ref (text)                   │→ response
            │ embed-image (DINOv3 1024d) → MLP projection (256d) → pgvector ANN match│
            └────────────────────────────────┬──────────────────────────────────────┘
                                              │ benchmark missing?
                                              ▼
            ┌──────────────────── SLOW PATH (durable async queue) ──────────────────┐
            │ claim job → Prism catalog resolution (official studio image URLs)      │
            │ download → embed-image (1024d) → projection (256d)                     │
            │ cross-check vs the user's scan vector  ── reject if too dissimilar     │
            │ confidence gate ── reject if identification certainty too low          │
            │ idempotent upsert → image_embeddings (is_benchmark=true)               │
            └───────────────────────────────────────────────────────────────────────┘
```

## Components

| Path | File |
|------|------|
| Fast-path API (`/scan`, `/health`) | `app/main.py` |
| Zero-shot identification (Gemini + Search) | `app/identification.py` |
| Embedding pipeline (Edge Fn + projection) | `app/embedding.py`, `app/projection.py` |
| Retrieval / match | `app/matching.py` |
| Durable harvest queue | `app/harvester/queue.py` |
| Catalog resolution | `app/harvester/catalog.py` |
| Cross-check + idempotent upsert | `app/harvester/upsert.py` |
| Worker loop | `app/harvester/worker.py`, `scripts/run_worker.py` |
| Expert verification API (`/admin/*`) | `app/admin.py` |
| Fine-grained heatmap verdict (`/verdict/deep`) | `app/verdict/heatmap.py` |
| Keypoint/homography alignment (ORB + RANSAC) | `app/verdict/align.py` |
| DINOv3 embedding boundary (global + patches) | `supabase/functions/embed-image/index.ts` |
| Schema | `supabase/migrations/0001_init.sql`, `0002_verified.sql` |

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/scan` | Identify + match; enqueue harvest if model unseen |
| GET | `/admin/benchmarks?verified=false` | List benchmarks (expert review). `X-Admin-Key` required |
| POST | `/admin/benchmarks/{id}/verify` | Promote a benchmark to expert-verified |
| DELETE | `/admin/benchmarks/{id}` | Remove a bad harvest |
| POST | `/verdict/deep` | Patch-level heatmap vs studio reference + anomaly score |

The matcher prefers expert-verified benchmarks, and `/scan` only returns
`authentic_candidate` when the match is against a verified row (otherwise
`review`).

## Design decisions (why it stays correct as it grows)

1. **Embedding parity.** Harvested studio images and user scans go through the
   *identical* DINOv3 → 256-dim projection transform (`app/projection.py`).
   Every row stores `embedding_version`; queries filter on it, so upgrading the
   model never silently mixes incomparable vectors.
2. **Anti-poisoning.** A wrong reference number would corrupt a model's
   benchmark forever, so the harvester applies two gates before any upsert: a
   **confidence gate** (identification certainty) and a **cross-check** (the
   official image must resemble the user's actual scan).
3. **Durable queue, not a thread.** Harvest work lives in `harvest_jobs` with
   atomic `claim_harvest_job()` (`FOR UPDATE SKIP LOCKED`), retries with
   backoff, and an at-most-one-active-job-per-model index. Survives restarts and
   scales to many workers.
4. **Idempotency.** `image_embeddings` is unique on
   `(brand, ref, source_url, embedding_version)`; re-runs and racing workers
   never duplicate.
5. **Honest verdicts.** Retrieval similarity yields a *preliminary* verdict
   only. The premium-authenticity call lives in `/verdict/deep`: the scan is
   homography-aligned to the studio reference (`app/verdict/align.py`) and then
   compared at the level of dense DINOv3 patch tokens, surfacing the divergent
   regions. Global embeddings retrieve the right *model*; this patch comparison
   is what begins to separate genuine from high-grade counterfeit.

## Testing

```bash
pip install -r requirements-dev.txt
pytest                                  # 16 tests, no external services needed
```
The API tests mock the embedding/Gemini/DB boundaries, so they run without API
keys, DINOv3, or Postgres. The alignment test exercises real OpenCV on a
synthetic warp.

### End-to-end locally without DINOv3 / weights
```bash
python scripts/make_dummy_weights.py                       # random 256x1024 probe
uvicorn scripts.mock_embed_server:app --port 9000          # fake embed-image
# point EMBED_FUNCTION_URL at http://localhost:9000/functions/v1/embed-image
```
This lets `/verdict/deep` and the matching/harvester paths run against a real
Postgres (e.g. the compose `db`) with deterministic stand-in vectors. `/scan`
identification still needs a real Gemini key.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env            # fill in credentials

# Database (Supabase or any Postgres with pgvector + pgcrypto)
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_verified.sql

# Edge function (set its env vars in the Supabase dashboard / secrets)
supabase functions deploy embed-image
```

Place the linear-probe weights at `app/weights/linear_probe.npz` containing
`W` of shape `(256, 1024)` and `b` of shape `(256,)`.

## Run

### Locally
```bash
uvicorn app.main:app --reload          # fast-path API
python scripts/run_worker.py           # one or more harvest workers

curl -F image=@watch.jpg http://localhost:8000/scan
```

### Docker Compose (Postgres + API + worker)
```bash
cp .env.example .env                    # set GEMINI/EMBED/ADMIN secrets
docker compose up --build
```
Compose starts `pgvector/pgvector:pg16` and runs both migrations from
`supabase/migrations/` automatically on first init (they are mounted into the
container's init dir). `DATABASE_URL` is injected to point at the `db` service,
so the only secrets you must provide are the Gemini key, the embed function
URL/secret, and `ADMIN_API_KEY`. Drop the projection weights into `app/weights/`
(mounted into both the API and worker containers).
