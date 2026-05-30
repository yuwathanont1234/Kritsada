"""Apply a newly-trained probe to every dumped feature and write the
projected vectors back to watch_embeddings under a new embedding_version.

Workflow:
  1. Load features_v1.npz (raw 1024-dim features keyed by source_url).
  2. Load app/weights/linear_probe.npz (the freshly-trained W, b).
  3. For each (source_url, brand, ref), compute y = L2norm(W @ x + b).
  4. UPSERT into watch_embeddings with embedding_version = --new-version.

The old probe-v1 rows are left untouched so you can A/B against them.

Usage:
    python scripts/reproject.py --new-version dinov3-vitl16/probe-v2
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

import numpy as np

log = logging.getLogger("reproject")


def _gelu(x: np.ndarray) -> np.ndarray:
    from math import erf
    sqrt2 = float(np.sqrt(2.0))
    return 0.5 * x * (1.0 + np.frompyfunc(erf, 1, 1)(x / sqrt2).astype(np.float32))


def project_batch(X: np.ndarray, weights: dict) -> np.ndarray:
    """(N, 1024) -> (N, 256), unit-normalised. Mirrors app.projection.project()."""
    if weights["arch"] == "linear":
        Y = X @ weights["W"].T + weights["b"]
    else:  # mlp
        H = _gelu(X @ weights["W1"].T + weights["b1"])
        Y = H @ weights["W2"].T + weights["b2"]
    norms = np.linalg.norm(Y, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return Y / norms


def load_probe(path: Path) -> dict:
    data = np.load(path, allow_pickle=True)
    keys = set(data.files)
    if {"W1", "b1", "W2", "b2"} <= keys:
        return {
            "arch": "mlp",
            "W1": np.asarray(data["W1"], dtype=np.float32),
            "b1": np.asarray(data["b1"], dtype=np.float32),
            "W2": np.asarray(data["W2"], dtype=np.float32),
            "b2": np.asarray(data["b2"], dtype=np.float32),
        }
    return {
        "arch": "linear",
        "W": np.asarray(data["W"], dtype=np.float32),
        "b": np.asarray(data["b"], dtype=np.float32),
    }


def upsert_one(cur, brand, ref, vec, source_url, new_version):
    cur.execute(
        """
        insert into watch_models (brand, ref, model)
        values (%s, %s, %s)
        on conflict (brand, ref) do update
            set model = coalesce(excluded.model, watch_models.model)
        """,
        (brand, ref, ref),
    )
    cur.execute(
        """
        insert into watch_embeddings
            (brand, ref, model, embedding, embedding_version,
             source, source_url, confidence, is_benchmark, harvested_at)
        values (%s, %s, %s, %s, %s, 'harvester', %s, 1.0, true, now())
        on conflict (brand, ref, source_url, embedding_version) do nothing
        """,
        (brand, ref, ref, vec, new_version, source_url),
    )


def main(args) -> None:
    from app.db import get_conn

    z = np.load(args.features, allow_pickle=True)
    X = z["X"].astype(np.float32)
    urls = z["source_url"]
    brands = z["brand"]
    refs = z["ref"]
    log.info("loaded %d features", len(X))

    weights = load_probe(args.weights)
    log.info("probe arch=%s", weights["arch"])
    Y = project_batch(X, weights)
    log.info("projected -> %s   unit-norm? min=%.3f max=%.3f",
             Y.shape, np.linalg.norm(Y, axis=1).min(), np.linalg.norm(Y, axis=1).max())

    if args.dry_run:
        print(f"Would UPSERT {len(Y)} rows with embedding_version={args.new_version}")
        return

    written = 0
    with get_conn() as conn, conn.cursor() as cur:
        for i in range(len(Y)):
            upsert_one(cur, str(brands[i]), str(refs[i]), Y[i], str(urls[i]), args.new_version)
            written += 1
            if written % 200 == 0:
                conn.commit()
                log.info("committed %d", written)
        conn.commit()
    log.info("done. wrote %d rows under %s", written, args.new_version)


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--features", type=Path,
                        default=Path(__file__).resolve().parent / "output" / "features_v1.npz")
    parser.add_argument("--weights", type=Path,
                        default=Path(__file__).resolve().parents[1] / "app" / "weights" / "linear_probe.npz")
    parser.add_argument("--new-version", default="dinov3-vitl16/probe-v2")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    main(args)


if __name__ == "__main__":
    cli()
