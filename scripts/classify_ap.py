"""Classify Audemars Piguet reference images into the correct AP collection.

The Royal_Oak/ folder was populated by brute-forcing Scene7 watch IDs 1..1242,
which pulled in non-Royal-Oak references too (Offshore, Code 11.59, Millenary,
Concept, Jules Audemars). We need the per-image collection label before any
ref-level retrieval will be meaningful.

This script:

  1. Walks official/Audemars_Piguet/.
  2. Sends each image to Gemini with a tight, AP-only classification prompt.
  3. Writes JSONL: {file, predicted_collection, confidence, raw}.

Output goes to scripts/output/ap_classifications.jsonl (idempotent: re-runs
skip files already labelled at >= --skip-confidence).

Usage:

    # Small smoke run (no API spend if you stop with Ctrl-C early):
    python scripts/classify_ap.py --limit 10

    # Full classification:
    python scripts/classify_ap.py --concurrency 4
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

log = logging.getLogger("classify_ap")

DEFAULT_AP_DIR = Path("/Users/kritsada/Desktop/Luxury Watch/official/Audemars_Piguet")
DEFAULT_OUT = Path(__file__).resolve().parent / "output" / "ap_classifications.jsonl"

# Canonical AP collections we want to distinguish. Free-form Gemini output is
# normalised to one of these via prefix match; anything else -> "Other".
AP_COLLECTIONS = [
    "Royal Oak",
    "Royal Oak Offshore",
    "Royal Oak Concept",
    "Code 11.59",
    "Millenary",
    "Jules Audemars",
    "CODE 11.59 Selfwinding",
]

_PROMPT = """You are a Audemars Piguet horology expert.
Classify the watch in this image into ONE of these AP collections:

  - Royal Oak               (integrated bracelet, octagonal bezel, tapisserie dial, NOT chrono case)
  - Royal Oak Offshore      (larger 42-45mm, rubber-clad pushers, sporty)
  - Royal Oak Concept       (skeletonized, very modern/futuristic case)
  - Code 11.59              (round case on octagonal middle, double-curved sapphire)
  - Millenary               (oval case, off-centre dial)
  - Jules Audemars          (classic round dress watch)
  - Other                   (anything else, including non-AP or unclear)

Respond with ONLY a JSON object, no markdown:
{"collection": "...", "confidence": 0.0, "reason": "<one short sentence>"}"""

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".avif"}
CONTENT_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".avif": "image/avif",
}


@dataclass
class APItem:
    path: Path
    rel: str            # e.g. "Royal_Oak/AP_watch_313_official.png"
    content_type: str


def _load_existing(out_path: Path) -> dict[str, dict]:
    if not out_path.exists():
        return {}
    rows: dict[str, dict] = {}
    for line in out_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        rows[row["file"]] = row
    return rows


def _walk(ap_dir: Path) -> list[APItem]:
    items: list[APItem] = []
    for path in sorted(ap_dir.rglob("*")):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext not in IMAGE_EXTS:
            continue
        rel = str(path.relative_to(ap_dir))
        items.append(APItem(path=path, rel=rel, content_type=CONTENT_TYPES[ext]))
    return items


def _normalise_collection(raw: str) -> str:
    s = (raw or "").strip().lower()
    # Order matters: check more-specific labels (Offshore, Concept) before the
    # generic "Royal Oak" prefix would swallow them.
    if "offshore" in s:
        return "Royal Oak Offshore"
    if "concept" in s:
        return "Royal Oak Concept"
    if "11.59" in s or s.startswith("code"):
        return "Code 11.59"
    if "millenary" in s:
        return "Millenary"
    if "jules" in s:
        return "Jules Audemars"
    if "royal oak" in s:
        return "Royal Oak"
    return "Other"


def _classify_one(item: APItem) -> dict:
    """Sync Gemini call. Wrap with asyncio.to_thread() for concurrency."""
    from google import genai
    from google.genai import types

    api_key = (
        os.environ.get("GEMINI_API_KEY")
        or os.environ.get("EXPO_PUBLIC_GEMINI_API_KEY")
    )
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY (or EXPO_PUBLIC_GEMINI_API_KEY) not set")
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    client = genai.Client(api_key=api_key)
    image_bytes = item.path.read_bytes()
    response = client.models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=item.content_type),
            _PROMPT,
        ],
        config=types.GenerateContentConfig(temperature=0.0),
    )
    text = (response.text or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"no JSON in response: {text!r}")
    parsed = json.loads(text[start : end + 1])
    return {
        "collection": _normalise_collection(parsed.get("collection", "")),
        "raw_collection": parsed.get("collection", ""),
        "confidence": float(parsed.get("confidence", 0.0)),
        "reason": (parsed.get("reason") or "").strip(),
    }


async def _run(
    items: list[APItem],
    out_path: Path,
    concurrency: int,
    skip_confidence: float,
) -> dict[str, int]:
    existing = _load_existing(out_path)
    todo = [
        it for it in items
        if existing.get(it.rel, {}).get("confidence", 0.0) < skip_confidence
    ]
    log.info(
        "AP images total=%d already_done=%d todo=%d",
        len(items), len(items) - len(todo), len(todo),
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(concurrency)
    counts = {"ok": 0, "failed": 0}
    started = time.time()
    done_count = 0
    lock = asyncio.Lock()

    async def worker(it: APItem) -> None:
        nonlocal done_count
        async with sem:
            try:
                result = await asyncio.to_thread(_classify_one, it)
                row = {"file": it.rel, **result}
                async with lock:
                    with out_path.open("a") as f:
                        f.write(json.dumps(row, ensure_ascii=False) + "\n")
                counts["ok"] += 1
            except Exception as exc:  # noqa: BLE001
                counts["failed"] += 1
                log.warning("FAIL %s: %s", it.rel, exc)
            done_count += 1
            if done_count % 10 == 0 or done_count == len(todo):
                rate = done_count / max(time.time() - started, 1e-6)
                log.info(
                    "[%d/%d] ok=%d failed=%d (%.2f/s)",
                    done_count, len(todo),
                    counts["ok"], counts["failed"], rate,
                )

    await asyncio.gather(*(worker(it) for it in todo))
    return counts


def _summarise(out_path: Path) -> None:
    rows = _load_existing(out_path)
    by_coll: dict[str, int] = {}
    for r in rows.values():
        by_coll[r.get("collection", "Other")] = by_coll.get(r.get("collection", "Other"), 0) + 1
    print(f"\nTotal classified: {len(rows)}")
    for c in sorted(by_coll, key=lambda k: -by_coll[k]):
        print(f"  {c:<28} {by_coll[c]:>5}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ap-dir", type=Path, default=DEFAULT_AP_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--skip-confidence", type=float, default=0.5,
                        help="Re-classify only if existing confidence < this.")
    parser.add_argument("--summarise-only", action="store_true",
                        help="Just print stats from the existing JSONL.")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.summarise_only:
        _summarise(args.out)
        return

    if not args.ap_dir.is_dir():
        sys.exit(f"AP dir not found: {args.ap_dir}")
    items = _walk(args.ap_dir)
    if args.limit > 0:
        items = items[: args.limit]
    asyncio.run(_run(items, args.out, args.concurrency, args.skip_confidence))
    _summarise(args.out)


if __name__ == "__main__":
    main()
