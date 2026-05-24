from functools import lru_cache
from pathlib import Path

import numpy as np

from app.config import get_settings

# Linear-probe projection: DINOv3 (1024-dim) -> compact RAG space (256-dim).
# This MUST be the identical transform for ingest (harvested studio images)
# and query (user scans), otherwise the vectors are not comparable.


@lru_cache
def _load_weights() -> tuple[np.ndarray, np.ndarray]:
    path = Path(get_settings().projection_weights_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Projection weights not found at {path}. Expected an .npz with "
            "'W' of shape (256, 1024) and 'b' of shape (256,)."
        )
    data = np.load(path)
    w = np.asarray(data["W"], dtype=np.float32)
    b = np.asarray(data["b"], dtype=np.float32)
    if w.shape != (256, 1024) or b.shape != (256,):
        raise ValueError(
            f"Unexpected weight shapes: W={w.shape}, b={b.shape}; "
            "expected W=(256, 1024), b=(256,)."
        )
    return w, b


def project(features_1024: np.ndarray) -> np.ndarray:
    """Project a 1024-dim DINOv3 feature to a unit-norm 256-dim vector."""
    w, b = _load_weights()
    x = np.asarray(features_1024, dtype=np.float32).reshape(-1)
    if x.shape != (1024,):
        raise ValueError(f"Expected 1024-dim input, got {x.shape}.")
    y = w @ x + b
    norm = np.linalg.norm(y)
    if norm == 0:
        raise ValueError("Projected vector has zero norm.")
    return y / norm
