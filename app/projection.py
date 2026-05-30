from functools import lru_cache
from pathlib import Path

import numpy as np

from app.config import get_settings

# DINOv3 (1024-dim) -> compact RAG space (256-dim) projection.
# Two architectures auto-detected from the npz keys:
#   linear : y = W @ x + b              (W 256x1024, b 256)
#   mlp    : y = W2 @ gelu(W1 @ x + b1) + b2
# Output is always L2-normalised. Ingest and query must use the IDENTICAL
# transform, otherwise vectors are not comparable.

_SQRT_2 = float(np.sqrt(2.0))


def _gelu(x: np.ndarray) -> np.ndarray:
    """Exact GELU matching torch.nn.GELU(approximate='none')."""
    # numpy >=1.18 has np.special.erf via np.frompyfunc; safer to use math.erf
    from math import erf
    return 0.5 * x * (1.0 + np.frompyfunc(erf, 1, 1)(x / _SQRT_2).astype(np.float32))


@lru_cache
def _load_weights() -> dict:
    path = Path(get_settings().projection_weights_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Projection weights not found at {path}. Expected an .npz."
        )
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
    if {"W", "b"} <= keys:
        w = np.asarray(data["W"], dtype=np.float32)
        b = np.asarray(data["b"], dtype=np.float32)
        if w.shape != (256, 1024) or b.shape != (256,):
            raise ValueError(f"Unexpected linear shapes: W={w.shape}, b={b.shape}")
        return {"arch": "linear", "W": w, "b": b}
    raise ValueError(f"Unknown probe format. Keys present: {keys}")


def project(features_1024: np.ndarray) -> np.ndarray:
    """Project 1024-dim DINOv3 features to a unit-norm 256-dim vector."""
    w = _load_weights()
    x = np.asarray(features_1024, dtype=np.float32).reshape(-1)
    if x.shape != (1024,):
        raise ValueError(f"Expected 1024-dim input, got {x.shape}.")
    if w["arch"] == "linear":
        with np.errstate(all="ignore"):
            y = w["W"] @ x + w["b"]
    else:  # mlp
        with np.errstate(all="ignore"):
            h = _gelu(w["W1"] @ x + w["b1"])
            y = w["W2"] @ h + w["b2"]
    norm = np.linalg.norm(y)
    if norm == 0:
        raise ValueError("Projected vector has zero norm.")
    return y / norm
