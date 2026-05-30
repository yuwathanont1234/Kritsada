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
    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "image": f"data:{content_type};base64,{image_b64}"
    }
    headers = {
        "x-embed-secret": settings.embed_function_secret,
    }
    if settings.expo_public_supabase_anon_key:
        headers["Authorization"] = f"Bearer {settings.expo_public_supabase_anon_key}"

    import asyncio

    # 429 = rate-limit -> worth retrying a few times.
    # 500 from this edge function is mostly Replicate rejecting a malformed
    # image; retrying 5x wastes ~60s per file. Cap 500s at 2 attempts.
    backoff_factor = 2.0
    initial_delay = 2.0
    max_retries_429 = 5
    max_retries_500 = 2

    async with httpx.AsyncClient(timeout=180.0) as client:
        attempt = 0
        while True:
            try:
                resp = await client.post(
                    settings.embed_function_url,
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
                break
            except httpx.HTTPStatusError as exc:
                code = exc.response.status_code
                cap = max_retries_429 if code == 429 else (max_retries_500 if code >= 500 else 0)
                if cap and attempt < cap - 1:
                    delay = initial_delay * (backoff_factor ** attempt)
                    print(f"Embedding request failed with {code}. Retrying in {delay:.1f}s (attempt {attempt + 1}/{cap})...")
                    await asyncio.sleep(delay)
                    attempt += 1
                else:
                    raise
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                if attempt < max_retries_429 - 1:
                    delay = initial_delay * (backoff_factor ** attempt)
                    print(f"Embedding request network/timeout error: {exc}. Retrying in {delay:.1f}s (attempt {attempt + 1}/{max_retries_429})...")
                    await asyncio.sleep(delay)
                    attempt += 1
                else:
                    raise

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
