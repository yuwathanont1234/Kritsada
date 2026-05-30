"""Bulk-index the local Luxury Watch /official reference dataset into pgvector.

Walks the folder tree:

    official/
      <Brand_Folder>/
        <Collection>/
          <image>.{png,jpg,jpeg,webp,avif}

and for each image:

  1. Reads bytes and runs the embed-image pipeline (DINOv3 -> 256-dim probe).
  2. Upserts a benchmark row keyed on (brand, ref, source_url, embedding_version),
     so re-runs are idempotent and safe to interrupt.

Brand display name comes from BRAND_DISPLAY (folder -> human name).
`ref` defaults to the collection sub-folder; pass --ref-from-filename to use the
filename stem instead. `source_url` is the absolute file path as a `file://` URI
unless an HTTP URL mapping is found in `<brand>_urls.txt`.

Usage:

    # Validate path/brand/ref mapping without calling the embed function:
    python scripts/index_official.py --dry-run

    # Index a single brand (cheap warm-up):
    python scripts/index_official.py --brand Rolex --limit 5

    # Full run with concurrency:
    python scripts/index_official.py --concurrency 4
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

# Make `app.*` importable when this script is run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

log = logging.getLogger("index_official")

DEFAULT_OFFICIAL_DIR = Path("/Users/kritsada/Desktop/Luxury Watch/official")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".avif"}
CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
}

# Folder name -> manufacturer's canonical display name.
BRAND_DISPLAY = {
    # Original 14 brands
    "Audemars_Piguet": "Audemars Piguet",
    "Breitling": "Breitling",
    "Cartier": "Cartier",
    "Chopard": "Chopard",
    "Franck_Muller": "Franck Muller",
    "Longines": "Longines",
    "Omega": "Omega",
    "Panerai": "Panerai",
    "Patek_Philippe": "Patek Philippe",
    "Rolex": "Rolex",
    "Seiko": "Seiko",
    "TAG_Heuer": "TAG Heuer",
    "TAG-Heuer": "TAG Heuer",
    "Tudor": "Tudor",
    "Zenith": "Zenith",
    # Expanded brand set
    "A_Lange_Soehne": "A. Lange & Söhne",
    "Angelus": "Angelus",
    "Arnold_Son": "Arnold & Son",
    "Bell_Ross": "Bell & Ross",
    "Blancpain": "Blancpain",
    "Bovet": "Bovet",
    "Breguet": "Breguet",
    "Bvlgari": "Bvlgari",
    "CVSTOS": "CVSTOS",
    "Christiaan_van_der_Klaauw": "Christiaan van der Klaauw",
    "Czapek": "Czapek",
    "De_Bethune": "De Bethune",
    "Edouard_Koehn": "Édouard Koehn",
    "F_P_Journe": "F.P. Journe",
    "Girard_Perregaux": "Girard-Perregaux",
    "Gorilla": "Gorilla",
    "Greubel_Forsey": "Greubel Forsey",
    "HYT": "HYT",
    "H_Moser": "H. Moser & Cie",
    "Hublot": "Hublot",
    "IWC": "IWC",
    "Jacob_Co": "Jacob & Co.",
    "Jaeger_LeCoultre": "Jaeger-LeCoultre",
    "Lang_Heyne": "Lang & Heyne",
    "Laurent_Ferrier": "Laurent Ferrier",
    "Lederer": "Lederer",
    "Louis_Erard": "Louis Erard",
    "Louis_Moinet": "Louis Moinet",
    "MB_F": "MB&F",
    "Montblanc": "Montblanc",
    "Moritz_Grossmann": "Moritz Grossmann",
    "Nivada_Grenchen": "Nivada Grenchen",
    "Nomos": "NOMOS Glashütte",
    "Parmigiani_Fleurier": "Parmigiani Fleurier",
    "Richard_Mille": "Richard Mille",
    "Tissot": "Tissot",
    "Frederique_Constant": "Frédérique Constant",
    "Grand_Seiko": "Grand Seiko",
    "Vacheron_Constantin": "Vacheron Constantin",
    "Hermes": "Hermès",
    "Piaget": "Piaget",
    "Glashutte_Original": "Glashütte Original",
    "Oris": "Oris",
    "Hamilton": "Hamilton",
    "Mido": "Mido",
    "Maurice_Lacroix": "Maurice Lacroix",
    "Citizen": "Citizen",
    "Trilobe": "Trilobe",
    "Ulysse_Nardin": "Ulysse Nardin",
    "Urwerk": "URWERK",
    # Omega × Swatch collaboration line (Bioceramic MoonSwatch).
    # Sold by Swatch, designed with Omega — distinct from Omega Speedmaster.
    # Brand display is "Swatch" (not "Omega") because Gemini's brand
    # identification outputs "Swatch" for MoonSwatch — the model field
    # carries "Omega x Swatch MoonSwatch Mission to <planet>".
    "Swatch_MoonSwatch": "Swatch",
}

# Filenames the dataset README flags as not actually depicting the watch.
QUALITY_BLACKLIST = {
    "Santos-Dumont_and_the_wristwatch_wm.jpg",
    "Longines_4_Grand_Prix_pocket_watch_-_clockwork_visible_-_enh_wm.jpg",
    "Sagittarius_Cloud,_Omega_Nebula_and_Eagle_Nebula_wikimedia.jpg",
    "雨后清晨因特拉肯还未开门的欧米伽表店_-_panoramio_wikimedia.jpg",
    "CROWN_GUARD_29728851024_wm.jpg",
}


@dataclass
class IndexItem:
    brand: str            # display name, e.g. "Audemars Piguet"
    ref: str              # retrieval key (collection name by default)
    model: str            # human-readable model label
    path: Path
    source_url: str       # stable identifier for idempotency
    content_type: str


def _collection_display(name: str) -> str:
    return name.replace("_", " ")


def _load_ap_classifications(path: Path) -> dict[str, dict]:
    """Returns {relative-path: {"collection": ..., "confidence": ...}}.

    The classifier output overrides the folder-derived ref for AP images so
    Royal Oak / Offshore / Code 11.59 mixed in the same folder get split.
    """
    if not path.exists():
        return {}
    out: dict[str, dict] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if "file" in row and "collection" in row:
            out[row["file"]] = row
    return out


def _load_blacklist_file(path: Path | None) -> set[str]:
    """Load extra filenames-to-skip from a text file (one per line, # for comments)."""
    if path is None or not path.exists():
        return set()
    out: set[str] = set()
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.add(line)
    return out


def _walk(
    root: Path,
    only_brand: str | None,
    skip_low: bool,
    ref_from_filename: bool,
    ap_class_path: Path | None = None,
    ap_min_confidence: float = 0.6,
    extra_blacklist: set[str] | None = None,
) -> list[IndexItem]:
    items: list[IndexItem] = []
    inv_quality: dict[str, str] = {}
    ap_classes = _load_ap_classifications(ap_class_path) if ap_class_path else {}
    blacklist = QUALITY_BLACKLIST | (extra_blacklist or set())

    inv_path = root / "inventory.json"
    if inv_path.exists():
        try:
            inv = json.loads(inv_path.read_text())
            for brand, bdata in inv.get("brands", {}).items():
                for _coll, cdata in bdata.get("collections", {}).items():
                    for img in cdata.get("images", []):
                        inv_quality[img["name"]] = img.get("quality", "")
        except Exception as exc:  # noqa: BLE001
            log.warning("could not parse inventory.json: %s", exc)

    for brand_folder, brand_display in BRAND_DISPLAY.items():
        if only_brand and brand_folder.lower() != only_brand.lower() \
                and brand_display.lower() != only_brand.lower():
            continue
        brand_root = root / brand_folder
        if not brand_root.is_dir():
            continue
        for path in sorted(brand_root.rglob("*")):
            if not path.is_file():
                continue
            ext = path.suffix.lower()
            if ext not in IMAGE_EXTS:
                continue
            if path.name in blacklist:
                continue
            quality = inv_quality.get(path.name)
            if skip_low and quality == "low":
                continue
            # path = official/Brand_Folder/Collection/[Sub/]file.ext
            rel_parts = path.relative_to(brand_root).parts
            if len(rel_parts) < 2:
                continue
            collection = rel_parts[0]
            ap_override = None
            if brand_folder == "Audemars_Piguet" and ap_classes:
                ap_rel = str(path.relative_to(brand_root))
                row = ap_classes.get(ap_rel)
                if row and row.get("confidence", 0.0) >= ap_min_confidence:
                    ap_override = row.get("collection")
            if ref_from_filename:
                ref = path.stem
            elif ap_override:
                ref = ap_override
            else:
                ref = _collection_display(collection)
            model = ap_override or _collection_display(collection)
            source_url = "file://" + quote(str(path.resolve()))
            items.append(
                IndexItem(
                    brand=brand_display,
                    ref=ref,
                    model=model,
                    path=path,
                    source_url=source_url,
                    content_type=CONTENT_TYPES[ext],
                )
            )
    return items


def _load_image_bytes(path: Path, content_type: str) -> tuple[bytes, str]:
    """Read image, transcoding AVIF/HEIC/anything-mislabelled to JPEG.

    The deployed embed-image edge function forwards to a Replicate Pillow
    backend that lacks the AVIF plugin and chokes on multi-MB uploads. We:
      1. Detect the actual format via magic bytes (file extension can lie —
         some brands ship AVIF under .jpg names).
      2. If actual format is AVIF/HEIC, transcode through Pillow -> JPEG.
      3. Also transcode if the file is > 2MB (downsize to 1024px long side).
    """
    raw = path.read_bytes()
    # Magic-byte detection: AVIF/HEIC files have 'ftypavif' or 'ftypheic'
    # in bytes 4..12 of the ISO Media container.
    head = raw[:32]
    is_avif_magic = b"ftypavif" in head or b"ftypheic" in head or b"ftypmif1" in head
    needs_transcode = (
        is_avif_magic
        or content_type == "image/avif"
        or len(raw) > 2_000_000
    )
    if not needs_transcode:
        return raw, content_type
    import io
    try:
        import pillow_avif  # noqa: F401 - registers AVIF decoder with Pillow
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


async def _embed_and_upsert(item: IndexItem, indexed_urls: set[str] | None = None) -> tuple[str, str | None]:
    """Returns (status, error). Status in {'inserted','skipped','failed'}."""
    import numpy as np
    from app.db import get_conn
    from app.embedding import embed_image
    from app.harvester.upsert import upsert_benchmark
    from app.config import get_settings

    if indexed_urls is not None:
        if item.source_url in indexed_urls:
            return "skipped", None
    else:
        settings = get_settings()
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        select 1 from watch_embeddings
                        where brand = %s and ref = %s and source_url = %s and embedding_version = %s
                        limit 1
                        """,
                        (item.brand, item.ref, item.source_url, settings.embedding_version),
                    )
                    if cur.fetchone() is not None:
                        return "skipped", None
        except Exception as exc:  # noqa: BLE001
            return "failed", f"existence check failed: {exc}"

    try:
        image_bytes, content_type = _load_image_bytes(item.path, item.content_type)
        vec = await embed_image(image_bytes, content_type)
        if not isinstance(vec, np.ndarray):
            vec = np.asarray(vec, dtype=np.float32)
    except Exception as exc:  # noqa: BLE001
        return "failed", f"embed failed: {exc}"
    try:
        with get_conn() as conn:
            inserted = upsert_benchmark(
                conn,
                brand=item.brand,
                ref=item.ref,
                model=item.model,
                embedding=vec,
                source_url=item.source_url,
                # 1.0 = curated official dataset, max trust.
                confidence=1.0,
            )
    except Exception as exc:  # noqa: BLE001
        return "failed", f"upsert failed: {exc}"
    return ("inserted" if inserted else "skipped"), None


async def _run(items: list[IndexItem], concurrency: int) -> dict[str, int]:
    sem = asyncio.Semaphore(concurrency)
    counts = {"inserted": 0, "skipped": 0, "failed": 0}
    failures: list[tuple[Path, str]] = []
    started = time.time()
    done_count = 0
    total = len(items)

    from app.config import get_settings
    from app.db import get_conn

    settings = get_settings()
    indexed_urls: set[str] = set()
    try:
        log.info("Fetching existing indexed references from database...")
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "select source_url from watch_embeddings where embedding_version = %s;",
                    (settings.embedding_version,),
                )
                indexed_urls = {row[0] for row in cur.fetchall() if row[0]}
        log.info("Found %d existing indexed references. Skip check optimized.", len(indexed_urls))
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not pre-fetch existing indexed references: %s. Will proceed with inline checks.", exc)

    async def worker(it: IndexItem) -> None:
        nonlocal done_count
        async with sem:
            status, err = await _embed_and_upsert(it, indexed_urls)
            counts[status] += 1
            done_count += 1
            if status == "failed":
                failures.append((it.path, err or ""))
                log.warning("[%d/%d] FAIL %s: %s", done_count, total, it.path.name, err)
            elif done_count % 25 == 0 or done_count == total:
                rate = done_count / max(time.time() - started, 1e-6)
                log.info(
                    "[%d/%d] inserted=%d skipped=%d failed=%d (%.1f/s)",
                    done_count, total,
                    counts["inserted"], counts["skipped"], counts["failed"],
                    rate,
                )

    await asyncio.gather(*(worker(it) for it in items))

    if failures:
        log.warning("first 5 failures:")
        for p, e in failures[:5]:
            log.warning("  %s -- %s", p, e)
    return counts


def _print_dry_run(items: list[IndexItem]) -> None:
    by_brand: dict[str, dict[str, int]] = {}
    for it in items:
        by_brand.setdefault(it.brand, {}).setdefault(it.ref, 0)
        by_brand[it.brand][it.ref] += 1
    total = sum(sum(refs.values()) for refs in by_brand.values())
    print(f"\nTotal indexable items: {total}\n")
    print(f"{'Brand':<20} {'Ref (collection)':<28} {'Count':>6}")
    print("-" * 56)
    for brand in sorted(by_brand):
        for ref in sorted(by_brand[brand]):
            print(f"{brand:<20} {ref:<28} {by_brand[brand][ref]:>6}")
    print("\nFirst 3 sample items:")
    for it in items[:3]:
        print(
            f"  brand={it.brand!r} ref={it.ref!r} model={it.model!r}\n"
            f"    path={it.path}\n"
            f"    source_url={it.source_url}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--official-dir", type=Path, default=DEFAULT_OFFICIAL_DIR)
    parser.add_argument("--brand", help="Only index a single brand folder or display name")
    parser.add_argument("--limit", type=int, default=0, help="Stop after N items (after filtering)")
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--ref-from-filename", action="store_true",
                        help="Use file stem as ref instead of the collection subfolder.")
    parser.add_argument("--skip-low", action="store_true",
                        help="Skip images marked quality=low in inventory.json.")
    parser.add_argument("--ap-classifications", type=Path,
                        default=Path(__file__).resolve().parent / "output" / "ap_classifications.jsonl",
                        help="JSONL from classify_ap.py; overrides AP ref per image.")
    parser.add_argument("--ap-min-confidence", type=float, default=0.6)
    parser.add_argument("--blacklist-file", type=Path,
                        default=Path(__file__).resolve().parent / "known_broken.txt",
                        help="Extra filenames to skip (one per line, # for comments).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Walk and report counts without calling embed or DB.")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if not args.official_dir.is_dir():
        sys.exit(f"official dir not found: {args.official_dir}")

    extra_blacklist = _load_blacklist_file(args.blacklist_file)
    if extra_blacklist:
        log.info("loaded %d extra blacklist entries from %s",
                 len(extra_blacklist), args.blacklist_file)
    items = _walk(
        args.official_dir,
        only_brand=args.brand,
        skip_low=args.skip_low,
        ref_from_filename=args.ref_from_filename,
        ap_class_path=args.ap_classifications,
        ap_min_confidence=args.ap_min_confidence,
        extra_blacklist=extra_blacklist,
    )
    if args.limit > 0:
        items = items[: args.limit]

    if args.dry_run:
        _print_dry_run(items)
        return

    if not items:
        print("No items to index.")
        return

    print(f"Indexing {len(items)} images (concurrency={args.concurrency})...")
    counts = asyncio.run(_run(items, args.concurrency))
    print(
        f"\nDone. inserted={counts['inserted']} "
        f"skipped(duplicate)={counts['skipped']} "
        f"failed={counts['failed']}"
    )
    if counts["failed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
