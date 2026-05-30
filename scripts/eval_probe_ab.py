"""Compare retrieval accuracy: probe-v1 (random Gaussian) vs probe-v2 (trained).

We use the cached 1024-dim features from features_v1.npz — so this is offline
and free. For each query (held out by class), we:
  - project with each candidate W -> normalise -> nearest-neighbour over the
    rest of the same projection space
  - check whether the NN has matching brand and matching (brand, ref).

Reports Top-1 brand and Top-1 (brand+ref) for each probe.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

log = logging.getLogger("eval_probe_ab")


def _gelu(x):
    from math import erf
    sqrt2 = float(np.sqrt(2.0))
    return 0.5 * x * (1.0 + np.frompyfunc(erf, 1, 1)(x / sqrt2).astype(np.float32))


def project(X, weights):
    if weights["arch"] == "linear":
        Y = X @ weights["W"].T + weights["b"]
    else:  # mlp
        H = _gelu(X @ weights["W1"].T + weights["b1"])
        Y = H @ weights["W2"].T + weights["b2"]
    n = np.linalg.norm(Y, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return Y / n


def load_probe_file(path: Path) -> dict:
    data = np.load(path, allow_pickle=True)
    keys = set(data.files)
    if {"W1", "b1", "W2", "b2"} <= keys:
        return {"arch": "mlp",
                "W1": np.asarray(data["W1"], dtype=np.float32),
                "b1": np.asarray(data["b1"], dtype=np.float32),
                "W2": np.asarray(data["W2"], dtype=np.float32),
                "b2": np.asarray(data["b2"], dtype=np.float32)}
    return {"arch": "linear",
            "W": np.asarray(data["W"], dtype=np.float32),
            "b": np.asarray(data["b"], dtype=np.float32)}


def eval_probe(name: str, X, brands, refs, weights, val_frac: float, seed: int):
    Y = project(X, weights)
    rng = np.random.default_rng(seed)

    # Per-class stratified split: hold out at most 20% per class, but require
    # >= 2 samples per class to be in the index.
    classes = np.array([f"{b}|{r}" for b, r in zip(brands, refs)])
    train_idx = []
    val_idx = []
    for cls in np.unique(classes):
        idx = np.where(classes == cls)[0]
        rng.shuffle(idx)
        if len(idx) < 2:
            train_idx.extend(idx)
            continue
        n_val = max(1, int(round(len(idx) * val_frac)))
        val_idx.extend(idx[:n_val])
        train_idx.extend(idx[n_val:])
    train_idx = np.array(sorted(train_idx))
    val_idx = np.array(sorted(val_idx))

    Yi = Y[train_idx]  # index set
    Yq = Y[val_idx]    # query set
    bi, ri = brands[train_idx], refs[train_idx]
    bq, rq = brands[val_idx], refs[val_idx]

    # Top-1 NN via dot product (vectors are unit-norm so cosine == dot).
    sims = Yq @ Yi.T
    nn = sims.argmax(axis=1)
    pred_b = bi[nn]
    pred_r = ri[nn]
    nn_sim = sims[np.arange(len(nn)), nn]

    brand_acc = float((pred_b == bq).mean())
    ref_acc = float(((pred_b == bq) & (pred_r == rq)).mean())
    avg_sim = float(nn_sim.mean())
    p10 = float(np.percentile(nn_sim, 10))
    p50 = float(np.percentile(nn_sim, 50))
    p90 = float(np.percentile(nn_sim, 90))

    print(f"=== {name} (n_index={len(Yi)}, n_query={len(Yq)}) ===")
    print(f"  Top-1 brand:           {brand_acc:.3%}")
    print(f"  Top-1 brand+ref:       {ref_acc:.3%}")
    print(f"  NN cosine: mean={avg_sim:.3f}  p10={p10:.3f}  p50={p50:.3f}  p90={p90:.3f}")
    return brand_acc, ref_acc, avg_sim


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", type=Path, default=Path("scripts/output/features_v1.npz"))
    parser.add_argument("--v1-weights", type=Path,
                        help="Random-Gaussian dummy weights (probe-v1). If missing, will regenerate seed=0 from app.projection.")
    parser.add_argument("--v2-weights", type=Path, default=Path("app/weights/linear_probe.npz"))
    parser.add_argument("--val-frac", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    z = np.load(args.features, allow_pickle=True)
    X = z["X"].astype(np.float32)
    brands = z["brand"]
    refs = z["ref"]

    # --- probe-v1: regenerate the dummy random weights (seed=0 baseline) ---
    rng = np.random.default_rng(0)
    W_v1 = rng.standard_normal((256, 1024)).astype("float32") / 32.0
    b_v1 = np.zeros(256, dtype="float32")
    eval_probe("probe-v1 (random Gaussian)", X, brands, refs,
               {"arch": "linear", "W": W_v1, "b": b_v1}, args.val_frac, args.seed)
    print()

    # --- probe-v2 / v3: trained probe (auto-detect linear vs mlp) ---
    weights = load_probe_file(args.v2_weights)
    eval_probe(f"trained ({weights['arch']})", X, brands, refs, weights, args.val_frac, args.seed)


if __name__ == "__main__":
    main()
