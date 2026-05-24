"""Drop-in stand-in for the Supabase `embed-image` Edge Function.

Returns deterministic vectors derived from the image bytes (same image -> same
vector), so the matching / cross-check / heatmap paths can be exercised
end-to-end without a real DINOv3 backend. Point EMBED_FUNCTION_URL at this.

    uvicorn scripts.mock_embed_server:app --port 9000
"""
import hashlib

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Mock embed-image")

DIM = 1024
GRID_H = GRID_W = 8


class EmbedRequest(BaseModel):
    image_b64: str
    content_type: str = "image/jpeg"
    mode: str = "global"


def _rng(image_b64: str) -> np.random.Generator:
    seed = int.from_bytes(hashlib.sha256(image_b64.encode()).digest()[:8], "big")
    return np.random.default_rng(seed)


@app.post("/functions/v1/embed-image")
def embed(req: EmbedRequest) -> dict:
    rng = _rng(req.image_b64)
    if req.mode == "patches":
        patches = rng.standard_normal((GRID_H * GRID_W, DIM)).astype("float32")
        return {"patches": patches.tolist(), "grid": [GRID_H, GRID_W]}
    return {"embedding": rng.standard_normal(DIM).astype("float32").tolist()}
