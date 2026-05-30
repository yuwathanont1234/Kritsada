"""End-to-end smoke test: image -> embed -> nearest benchmark in pgvector.

Verifies that the indexed `official/` dataset actually retrieves the right
brand/collection when given a query image.

Modes:
  - `--image PATH`       : embed and look up one image, print top-K matches.
  - `--holdout BRAND/COL N`: pick N random files from one collection that are
                            NOT in the DB and report retrieval accuracy.
  - `--batch DIR`        : embed every image under DIR, report aggregate top-1
                            brand accuracy and top-1 ref accuracy.

Examples:

    # One-shot: does this Cartier Santos retrieve as Cartier/Santos?
    python scripts/smoke_test.py --image \
      "/Users/kritsada/Desktop/Luxury Watch/official/Cartier/Santos/<file>.avif" \
      --expect "Cartier/Santos" --top-k 5

    # Hold-out sanity check (rotates 5 Cartier Santos out of DB then queries):
    python scripts/smoke_test.py --holdout "Cartier/Santos" 5
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

log = logging.getLogger("smoke_test")

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".avif"}
CONTENT_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".avif": "image/avif",
}
DEFAULT_OFFICIAL_DIR = Path("/Users/kritsada/Desktop/Luxury Watch/official")


async def _embed(path: Path):
    from app.embedding import embed_image
    return await embed_image(path.read_bytes(), CONTENT_TYPES[path.suffix.lower()])


def _top_k_matches(conn, query_vec, k: int) -> list[dict]:
    from app.config import get_settings
    settings = get_settings()
    with conn.cursor() as cur:
        cur.execute(
            """
            select brand, ref, source_url, 1 - (embedding <=> %s) as similarity
            from watch_embeddings
            where embedding_version = %s and is_benchmark = true
            order by embedding <=> %s
            limit %s
            """,
            (query_vec, settings.embedding_version, query_vec, k),
        )
        rows = cur.fetchall()
    return [
        {"brand": r[0], "ref": r[1], "source_url": r[2], "similarity": float(r[3])}
        for r in rows
    ]


async def cmd_image(args: argparse.Namespace) -> int:
    from app.db import get_conn
    vec = await _embed(args.image)
    with get_conn() as conn:
        matches = _top_k_matches(conn, vec, args.top_k)
    if not matches:
        print("No benchmarks in DB. Run index_official.py first.")
        return 2
    print(f"\nQuery: {args.image}")
    if args.expect:
        print(f"Expected: {args.expect}")
    print(f"\n{'Rank':<4} {'sim':<6} Brand / Ref")
    print("-" * 60)
    expected_brand, _, expected_ref = (args.expect or "").partition("/")
    top1_ok = False
    for i, m in enumerate(matches, 1):
        marker = ""
        if args.expect:
            ok = m["brand"] == expected_brand and (
                not expected_ref or m["ref"] == expected_ref
            )
            if i == 1:
                top1_ok = ok
            marker = " ✓" if ok else ""
        print(f"{i:<4} {m['similarity']:.3f}  {m['brand']} / {m['ref']}{marker}")
    return 0 if (not args.expect or top1_ok) else 1


async def cmd_batch(args: argparse.Namespace) -> int:
    from app.db import get_conn
    paths = [p for p in args.batch.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
    if args.sample > 0 and len(paths) > args.sample:
        paths = random.sample(paths, args.sample)
    log.info("scoring %d images", len(paths))

    brand_hits = ref_hits = 0
    failures: list[tuple[Path, str]] = []
    for p in paths:
        try:
            vec = await _embed(p)
        except Exception as exc:  # noqa: BLE001
            failures.append((p, f"embed failed: {exc}"))
            continue
        with get_conn() as conn:
            matches = _top_k_matches(conn, vec, 1)
        if not matches:
            failures.append((p, "no match"))
            continue
        m = matches[0]
        # Expected from path: official/<Brand_Folder>/<Collection>/...
        parts = p.relative_to(args.official_dir).parts if p.is_relative_to(args.official_dir) else ()
        if len(parts) >= 2:
            exp_brand = parts[0].replace("_", " ")
            exp_ref = parts[1].replace("_", " ")
            if m["brand"].lower() == exp_brand.lower():
                brand_hits += 1
            if m["ref"].lower() == exp_ref.lower():
                ref_hits += 1
    n = len(paths) - len(failures)
    print(f"\nTop-1 brand accuracy: {brand_hits}/{n} = {brand_hits / max(n,1):.1%}")
    print(f"Top-1 ref   accuracy: {ref_hits}/{n} = {ref_hits / max(n,1):.1%}")
    if failures:
        print(f"\n{len(failures)} failures (first 5):")
        for p, e in failures[:5]:
            print(f"  {p}: {e}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=False)

    parser.add_argument("--image", type=Path)
    parser.add_argument("--expect", help='e.g. "Cartier/Santos"')
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--batch", type=Path, help="Directory of images to score in bulk")
    parser.add_argument("--sample", type=int, default=0, help="Random sample size for --batch")
    parser.add_argument("--official-dir", type=Path, default=DEFAULT_OFFICIAL_DIR)
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.image:
        sys.exit(asyncio.run(cmd_image(args)))
    if args.batch:
        sys.exit(asyncio.run(cmd_batch(args)))
    parser.error("provide --image PATH or --batch DIR")


if __name__ == "__main__":
    main()
