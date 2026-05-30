"""Re-project image_embeddings.image_embedding_v2 using a newly-trained probe.

This is the table that the MOBILE app actually queries via the
`match_watches_v2` Supabase RPC. The raw 1024-dim embeddings stored in
`image_embedding` are reused (no Replicate calls needed) — we only
re-do the 1024→256 projection in NumPy and write the result back into
`image_embedding_v2`.

The reproject MUST be kept in sync with the mobile-side probe binary
(`src/lib/data/linear-probe-weights.bin`) — if they're out of sync the
query vectors and stored vectors live in different latent spaces and
similarities become noise. Always swap both together.

Usage:
    python scripts/reproject_image_embeddings.py \
        --weights scripts/output/probe_v4_weights.npz
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

import numpy as np
import psycopg

log = logging.getLogger("reproject_image_embeddings")


def _gelu(x: np.ndarray) -> np.ndarray:
    # Approximate GELU matching torch's nn.functional.gelu(approximate='tanh').
    # Train_probe.py uses the same approximation.
    return 0.5 * x * (1.0 + np.tanh(np.sqrt(2.0 / np.pi) * (x + 0.044715 * x**3)))


def project_batch(X: np.ndarray, W1, b1, W2, b2) -> np.ndarray:
    """(N, 1024) → (N, 256), unit-normalised."""
    H = _gelu(X.astype(np.float32) @ W1.T.astype(np.float32) + b1.astype(np.float32))
    Y = H @ W2.T.astype(np.float32) + b2.astype(np.float32)
    norms = np.linalg.norm(Y, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (Y / norms).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weights", type=Path, required=True,
                    help="Path to probe NPZ (must have W1, b1, W2, b2)")
    ap.add_argument("--batch", type=int, default=200,
                    help="Rows per DB roundtrip (default 200)")
    ap.add_argument("--limit", type=int, default=0,
                    help="Process at most N rows (0 = all)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    d = np.load(args.weights, allow_pickle=True)
    W1 = d["W1"].astype(np.float32)
    b1 = d["b1"].astype(np.float32).flatten()
    W2 = d["W2"].astype(np.float32)
    b2 = d["b2"].astype(np.float32).flatten()
    log.info(f"Probe loaded: W1={W1.shape} b1={b1.shape} W2={W2.shape} b2={b2.shape}")

    db_url = os.environ["DATABASE_URL"]

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("select count(*) from image_embeddings where image_embedding is not null")
            total = cur.fetchone()[0]
            log.info(f"Rows to process: {total:,}")

    if args.limit:
        total = min(total, args.limit)

    if args.dry_run:
        log.info("DRY RUN — no DB writes")
        return

    processed = 0
    t0 = time.time()
    offset = 0
    with psycopg.connect(db_url) as conn:
        while processed < total:
            with conn.cursor() as cur:
                # pull a batch — vectors come back as strings like "[0.1,0.2,...]"
                cur.execute("""
                    select id, image_embedding::text
                    from image_embeddings
                    where image_embedding is not null
                    order by id
                    limit %s offset %s
                """, (args.batch, offset))
                rows = cur.fetchall()

            if not rows:
                break

            ids = [r[0] for r in rows]
            X = np.zeros((len(rows), 1024), dtype=np.float32)
            for i, (_, vec_str) in enumerate(rows):
                # pgvector text format: "[0.1,-0.2,...]"
                vec_str = vec_str.strip('[]')
                X[i] = np.fromstring(vec_str, sep=',', dtype=np.float32)

            Y = project_batch(X, W1, b1, W2, b2)

            # Write back v2 column
            with conn.cursor() as cur:
                for id_, vec in zip(ids, Y):
                    # vector(256) input format: '[0.1,0.2,...]'
                    vec_lit = '[' + ','.join(f"{v:.6f}" for v in vec) + ']'
                    cur.execute(
                        "update image_embeddings set image_embedding_v2 = %s::vector where id = %s",
                        (vec_lit, id_)
                    )
                conn.commit()

            processed += len(rows)
            offset += len(rows)
            rate = processed / max(time.time() - t0, 1e-6)
            log.info(f"[{processed}/{total}] rate={rate:.1f}/s elapsed={time.time()-t0:.0f}s")

    log.info(f"✅ Done. Reprojected {processed:,} rows in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
