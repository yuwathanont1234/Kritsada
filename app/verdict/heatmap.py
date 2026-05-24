import base64
import io

import httpx
import numpy as np
from PIL import Image

from app.config import get_settings

# Fine-grained authenticity heatmap.
#
# Global 256-dim retrieval tells us *which model* a watch is, but cannot
# separate genuine from high-grade counterfeit. For that we compare DENSE
# DINOv3 patch tokens between the user scan and the reference studio image and
# surface the regions that diverge most (logo, date window, dial text, etc.).
#
# LIMITATION: this compares patch grids position-for-position and therefore
# assumes the two images share the same grid and rough alignment (centered,
# similar pose/scale). A production system must run keypoint/homography
# alignment before this step; otherwise pose differences register as anomalies.


async def patch_features(image_bytes: bytes, content_type: str = "image/jpeg") -> np.ndarray:
    """Dense DINOv3 patch tokens, shape (grid_h, grid_w, dim)."""
    settings = get_settings()
    payload = {
        "image_b64": base64.b64encode(image_bytes).decode("ascii"),
        "content_type": content_type,
        "mode": "patches",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            settings.embed_function_url,
            json=payload,
            headers={"x-embed-secret": settings.embed_function_secret},
        )
        resp.raise_for_status()
        data = resp.json()

    grid_h, grid_w = int(data["grid"][0]), int(data["grid"][1])
    patches = np.asarray(data["patches"], dtype=np.float32)
    if patches.ndim != 2 or patches.shape[0] != grid_h * grid_w:
        raise ValueError(
            f"patch payload {patches.shape} inconsistent with grid {grid_h}x{grid_w}"
        )
    return patches.reshape(grid_h, grid_w, patches.shape[1])


def _l2norm(a: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(a, axis=-1, keepdims=True)
    n[n == 0] = 1.0
    return a / n


def patch_distance_map(user: np.ndarray, ref: np.ndarray) -> np.ndarray:
    """Per-patch cosine distance in [0, 1]; higher = more divergent."""
    if user.shape[:2] != ref.shape[:2]:
        raise ValueError(
            f"patch grids differ ({user.shape[:2]} vs {ref.shape[:2]}); "
            "align/resize before comparison"
        )
    cos = np.sum(_l2norm(user) * _l2norm(ref), axis=-1)  # (h, w) in [-1, 1]
    return (1.0 - cos) / 2.0


def anomaly_score(dist: np.ndarray, top_fraction: float = 0.2) -> float:
    """Mean of the worst `top_fraction` patches — localized fakes shouldn't be
    washed out by a large matching background."""
    flat = np.sort(dist.reshape(-1))[::-1]
    k = max(1, int(top_fraction * flat.size))
    return float(flat[:k].mean())


def render_heatmap(dist: np.ndarray, base_image_bytes: bytes) -> bytes:
    """Red overlay of the distance map on the user image, returned as PNG."""
    base = Image.open(io.BytesIO(base_image_bytes)).convert("RGB")
    width, height = base.size

    span = dist.max() - dist.min()
    norm = (dist - dist.min()) / (span + 1e-8)
    heat = Image.fromarray((norm * 255).astype("uint8")).resize(
        (width, height), Image.BILINEAR
    )
    heat_np = np.asarray(heat, dtype=np.float32) / 255.0

    base_np = np.asarray(base, dtype=np.float32) / 255.0
    overlay = np.zeros_like(base_np)
    overlay[..., 0] = heat_np  # red
    alpha = 0.5 * heat_np[..., None]
    blended = base_np * (1 - alpha) + overlay * alpha

    out = Image.fromarray((blended * 255).astype("uint8"))
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()
