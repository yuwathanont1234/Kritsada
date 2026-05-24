"""Write a random linear-probe projection (256x1024) for local testing only.

    python scripts/make_dummy_weights.py

Real deployments must ship the trained probe weights instead.
"""
from pathlib import Path

import numpy as np

from app.config import get_settings


def main() -> None:
    path = Path(get_settings().projection_weights_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    np.savez(
        path,
        W=rng.standard_normal((256, 1024)).astype("float32") / 32.0,
        b=np.zeros(256, dtype="float32"),
    )
    print(f"wrote dummy weights to {path}")


if __name__ == "__main__":
    main()
