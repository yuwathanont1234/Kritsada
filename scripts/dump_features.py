"""Re-embed every benchmark row to capture raw 1024-dim DINOv3 features.

Why: watch_embeddings only stores the 256-dim *projected* vector, but training
a real linear probe needs the raw 1024-dim features. This script reads each
row's source_url (file:// path), calls the edge function to get the 1024-dim
embedding (without projection), and dumps:

    scripts/output/features_v1.npz
        X         (N, 1024) float32   — raw DINOv3 features
        labels    (N,)      int32     — class id = index into classes
        classes   (K,)      str       — "Brand|ref" strings, ordered by class id
        source_url (N,)     str       — for joining back to DB rows
        brand     (N,)      str
        ref       (N,)      str

Resumes from a partial dump (existing rows + their indices stay intact).

Usage:
    python scripts/dump_features.py --concurrency 4
    python scripts/dump_features.py --limit 20  # quick smoke
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import os
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

import httpx
import numpy as np

log = logging.getLogger("dump_features")

DEFAULT_OUT = Path(__file__).resolve().parent / "output" / "features_v1.npz"
CONTENT_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".avif": "image/avif",
}


def _load_image_bytes(path: Path, content_type: str) -> tuple[bytes, str]:
    """Same transcode/downsize as index_official.py."""
    raw = path.read_bytes()
    if content_type != "image/avif" and len(raw) <= 2_000_000:
        return raw, content_type
    import io
    try:
        import pillow_avif  # noqa: F401
    except ImportError:
        pass
    from PIL import Image
    with Image.open(io.BytesIO(raw)) as im:
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGB")
        w, h = im.size
        long_side = max(w, h)
        if long_side > 1024:
            scale = 1024 / long_side
            im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=88, optimize=True)
        return buf.getvalue(), "image/jpeg"


async def _embed_1024(client: httpx.AsyncClient, image_bytes: bytes, content_type: str) -> np.ndarray:
    """Call edge function, return raw 1024-dim features (NO projection)."""
    data_url = f"data:{content_type};base64," + base64.b64encode(image_bytes).decode("ascii")
    headers = {"x-embed-secret": os.environ["EMBED_FUNCTION_SECRET"]}
    anon = os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")
    if anon:
        headers["Authorization"] = f"Bearer {anon}"

    for attempt in range(3):
        try:
            resp = await client.post(
                os.environ["EMBED_FUNCTION_URL"],
                json={"image": data_url},
                headers=headers,
                timeout=180.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                return np.asarray(data["embedding"], dtype=np.float32)
            if resp.status_code == 429 or (resp.status_code >= 500 and attempt == 0):
                await asyncio.sleep(2.0 * (2 ** attempt))
                continue
            resp.raise_for_status()
        except (httpx.ConnectError, httpx.TimeoutException):
            if attempt < 2:
                await asyncio.sleep(2.0 * (2 ** attempt))
                continue
            raise
    raise RuntimeError("embed retries exhausted")


def _path_from_source_url(url: str) -> Path | None:
    if not url.startswith("file://"):
        return None
    return Path(unquote(urlparse(url).path))


async def _process_row(client, row, sem) -> tuple | None:
    """Returns (X_1024, brand, ref, source_url) or None on failure."""
    brand, ref, source_url = row
    async with sem:
        p = _path_from_source_url(source_url)
        if p is None or not p.is_file():
            return None
        ext = p.suffix.lower()
        ct = CONTENT_TYPES.get(ext)
        if ct is None:
            return None
        try:
            img_bytes, ct2 = _load_image_bytes(p, ct)
            vec = await _embed_1024(client, img_bytes, ct2)
        except Exception as exc:  # noqa: BLE001
            log.warning("FAIL %s: %s", p.name, exc)
            return None
        if vec.shape != (1024,):
            return None
        return vec, brand, ref, source_url


def _load_existing(out_path: Path) -> dict[str, np.ndarray]:
    """If a partial dump exists, return {source_url: vector} so we can resume."""
    if not out_path.exists():
        return {}
    z = np.load(out_path, allow_pickle=True)
    urls = z["source_url"].tolist()
    X = z["X"]
    return {u: X[i] for i, u in enumerate(urls)}


async def main(args) -> None:
    from app.db import get_conn

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "select brand, ref, source_url from watch_embeddings "
            "where is_benchmark = true and source_url is not null "
            "and embedding_version = %s "
            "order by source_url",
            (args.embedding_version,),
        )
        all_rows = cur.fetchall()

    existing = _load_existing(args.out)
    todo = [r for r in all_rows if r[2] not in existing]
    log.info("DB rows: %d   already_dumped: %d   todo: %d",
             len(all_rows), len(existing), len(todo))

    if args.limit > 0:
        todo = todo[: args.limit]

    sem = asyncio.Semaphore(args.concurrency)
    results: dict[str, tuple] = {}  # source_url -> (vec, brand, ref)
    for u, vec in existing.items():
        results[u] = (vec, None, None)  # brand/ref filled below

    started = time.time()
    done = 0
    async with httpx.AsyncClient() as client:
        tasks = [_process_row(client, r, sem) for r in todo]
        for coro in asyncio.as_completed(tasks):
            r = await coro
            done += 1
            if r is not None:
                vec, b, ref, url = r
                results[url] = (vec, b, ref)
            if done % 25 == 0 or done == len(todo):
                rate = done / max(time.time() - started, 1e-6)
                log.info("[%d/%d] rate=%.2f/s  collected=%d",
                         done, len(todo), rate, len(results))

    # Build full label arrays. Brand/ref came from DB row; existing rows were
    # already dumped previously, so refetch their labels from DB.
    url_to_label = {url: (b, ref) for b, ref, url in all_rows}
    rows_out = []
    for url, (vec, b, ref) in results.items():
        if b is None:
            b, ref = url_to_label.get(url, (None, None))
        if b is None or ref is None:
            continue
        rows_out.append((url, vec, b, ref))
    rows_out.sort(key=lambda r: r[0])

    urls = np.array([r[0] for r in rows_out])
    X = np.stack([r[1] for r in rows_out]).astype(np.float32)
    brands = np.array([r[2] for r in rows_out])
    refs = np.array([r[3] for r in rows_out])

    # Class = brand + "|" + ref
    class_strs = np.array([f"{b}|{r}" for b, r in zip(brands, refs)])
    classes, labels = np.unique(class_strs, return_inverse=True)
    labels = labels.astype(np.int32)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        args.out,
        X=X,
        labels=labels,
        classes=classes,
        source_url=urls,
        brand=brands,
        ref=refs,
    )
    log.info("wrote %s  X=%s  classes=%d", args.out, X.shape, len(classes))


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--embedding-version", default="dinov3-vitl16/probe-v1")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
