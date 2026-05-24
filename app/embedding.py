import base64

import httpx
import numpy as np

from app.config import get_settings
from app.projection import project


async def embed_image(image_bytes: bytes, content_type: str = "image/jpeg") -> np.ndarray:
    """Run the full query/ingest embedding pipeline on raw image bytes.

    Step 1: Supabase Edge Function `embed-image` returns 1024-dim DINOv3 features.
    Step 2: in-app linear-probe projection to a unit-norm 256-dim vector.
    """
    settings = get_settings()
    payload = {
        "image_b64": base64.b64encode(image_bytes).decode("ascii"),
        "content_type": content_type,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            settings.embed_function_url,
            json=payload,
            headers={"x-embed-secret": settings.embed_function_secret},
        )
        resp.raise_for_status()
        data = resp.json()

    features = np.asarray(data["embedding"], dtype=np.float32)
    if features.shape != (1024,):
        raise ValueError(
            f"embed-image returned shape {features.shape}, expected (1024,)."
        )
    return project(features)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float32).reshape(-1)
    b = np.asarray(b, dtype=np.float32).reshape(-1)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)
