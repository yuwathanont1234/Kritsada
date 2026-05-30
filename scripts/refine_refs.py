"""Refine ref labels: ask Gemini for the real manufacturer reference number
for each benchmark image, store it in watch_embeddings.model.

Why a separate field?
  - `ref` is the collection-level retrieval key (e.g. "Submariner"). Many
    rows share it, which is GOOD for retrieval.
  - `model` becomes the per-image manufacturer code (e.g. "126610LN").
    Useful for display in the app: "Rolex Submariner 126610LN".

Idempotent: rows where `model` is already a refined manufacturer ref
(differs from `ref` and contains digits or 4+ chars) are skipped on re-run.

Outputs:
  scripts/output/refine_refs_log.jsonl  one row per Gemini call

Usage:
    python scripts/refine_refs.py --limit 10        # smoke test
    python scripts/refine_refs.py --concurrency 4   # full run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
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

log = logging.getLogger("refine_refs")

DEFAULT_LOG = Path(__file__).resolve().parent / "output" / "refine_refs_log.jsonl"
CONTENT_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".avif": "image/avif",
}

# A refined "model" should look like a real manufacturer code:
#   - contains digits, OR
#   - is at least 6 chars long and differs from the collection ref
_REF_LIKE = re.compile(r"^[A-Z0-9][A-Z0-9.\- /]{2,}$", re.IGNORECASE)


def _looks_refined(model: str | None, ref: str) -> bool:
    if not model:
        return False
    if model.strip() == ref.strip():
        return False
    if any(c.isdigit() for c in model):
        return True
    if len(model.strip()) >= 6 and _REF_LIKE.match(model.strip()):
        return True
    return False


def _path_from_url(url: str) -> Path | None:
    if not url or not url.startswith("file://"):
        return None
    return Path(unquote(urlparse(url).path))


def _transcode_if_needed(path: Path, content_type: str) -> tuple[bytes, str]:
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


_PROMPT = """You are a horology expert. Identify the watch in this image and
return ONLY its manufacturer reference / model number, e.g. "126610LN",
"Ref. 5167A-001", "IW327004", "Q1548530".

Brand hint: {brand}
Collection hint: {collection}

Output STRICTLY as a JSON object with no markdown:
{{"manufacturer_ref": "...", "confidence": 0.0}}
- "manufacturer_ref" is the official reference; do NOT include the brand
  name or collection name; use empty string if you cannot read or infer it.
- "confidence" is 0..1; use < 0.5 if you are guessing.
If you cannot identify a real reference, return {{"manufacturer_ref": "", "confidence": 0.0}}."""


def _ask_gemini(brand: str, ref: str, image_bytes: bytes, content_type: str) -> dict:
    from google import genai
    from google.genai import types

    api_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("EXPO_PUBLIC_GEMINI_API_KEY")
    )
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=model_name,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=content_type),
            _PROMPT.format(brand=brand, collection=ref),
        ],
        config=types.GenerateContentConfig(temperature=0.0),
    )
    text = (resp.text or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"no JSON in response: {text!r}")
    parsed = json.loads(text[start : end + 1])
    return {
        "manufacturer_ref": (parsed.get("manufacturer_ref") or "").strip(),
        "confidence": float(parsed.get("confidence", 0.0)),
    }


async def _process_row(row, sem, min_confidence: float, dry_run: bool, log_path: Path):
    from app.db import get_conn
    id_, brand, ref, model, source_url = row
    async with sem:
        p = _path_from_url(source_url)
        if p is None or not p.is_file():
            return None
        ext = p.suffix.lower()
        ct = CONTENT_TYPES.get(ext)
        if ct is None:
            return None
        try:
            image_bytes, ct2 = await asyncio.to_thread(_transcode_if_needed, p, ct)
            result = await asyncio.to_thread(_ask_gemini, brand, ref, image_bytes, ct2)
        except Exception as exc:  # noqa: BLE001
            log.warning("FAIL %s/%s: %s", brand, ref, exc)
            return None

        new_ref = result["manufacturer_ref"]
        conf = result["confidence"]
        entry = {
            "id": str(id_),
            "brand": brand,
            "ref": ref,
            "old_model": model,
            "new_model": new_ref,
            "confidence": conf,
        }
        async with asyncio.Lock():
            with log_path.open("a") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        if not new_ref or conf < min_confidence:
            return entry

        if dry_run:
            return entry

        # Persist
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(
                    "update watch_embeddings set model = %s where id = %s",
                    (new_ref, id_),
                )
                conn.commit()
        except Exception as exc:  # noqa: BLE001
            log.warning("UPDATE failed for %s: %s", id_, exc)
            return None
        return entry


async def main(args) -> None:
    from app.db import get_conn

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, brand, ref, model, source_url
            from watch_embeddings
            where embedding_version = %s
              and is_benchmark = true
              and source = 'harvester'
              and source_url like 'file://%%'
            order by brand, ref
            """,
            (args.embedding_version,),
        )
        rows = cur.fetchall()

    # Skip rows already refined
    todo = [r for r in rows if not _looks_refined(r[3], r[2])]
    log.info("total benchmark rows: %d   already_refined: %d   todo: %d",
             len(rows), len(rows) - len(todo), len(todo))

    if args.limit > 0:
        todo = todo[: args.limit]

    args.log_path.parent.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(args.concurrency)
    started = time.time()
    done = 0
    updated = 0
    skipped_low_conf = 0

    async def runner(r):
        nonlocal done, updated, skipped_low_conf
        result = await _process_row(r, sem, args.min_confidence, args.dry_run, args.log_path)
        done += 1
        if result and result["new_model"] and result["confidence"] >= args.min_confidence:
            updated += 1
        elif result:
            skipped_low_conf += 1
        if done % 25 == 0 or done == len(todo):
            rate = done / max(time.time() - started, 1e-6)
            log.info(
                "[%d/%d] updated=%d skipped_low_conf=%d rate=%.2f/s",
                done, len(todo), updated, skipped_low_conf, rate,
            )

    await asyncio.gather(*(runner(r) for r in todo))
    log.info("DONE updated=%d skipped_low_conf=%d", updated, skipped_low_conf)


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--min-confidence", type=float, default=0.5)
    parser.add_argument("--embedding-version", default="dinov3-vitl16/probe-v3")
    parser.add_argument("--log-path", type=Path, default=DEFAULT_LOG)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
