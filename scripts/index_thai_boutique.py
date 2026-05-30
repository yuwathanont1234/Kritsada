"""Index Thai boutique scrape data into watches + image_embeddings.

═══════════════════════════════════════════════════════════════════════════
WHY: User has scraped 6,556 watches / 31,703 photos from official Thai
boutique websites (Seiko Boutique TH, Rolex Thailand, Patek dealers, etc.)
via WordPress + WooCommerce /wp-json/wc/store/v1/products API.

Each scrape lives at:
    /Users/kritsada/Desktop/Luxury Watch/<BrandFolder>/<COLLECTION>/
        HBC001J__SQ_Product-HBC001J-1.jpg
        HBC001J__SQ_Product-HBC001J-2.jpg
        ...
        _catalog.csv     ← sku, name, price_thb, permalink

This data is GOLD because:
  1. Studio-quality product photos from official source
  2. Authoritative product names (no Gemini guessing needed)
  3. Real Thai market prices in THB (perfect for price_cache)
  4. Direct mapping: filename SKU prefix → catalog row

═══════════════════════════════════════════════════════════════════════════
PIPELINE:

For each (brand_folder, collection_folder):
  1. Load _catalog.csv into SKU → {name, price_thb, permalink} dict
  2. For each image file in folder:
     a. Parse filename: '<SKU>__<original-name>.<ext>'
     b. Lookup CSV row by SKU
     c. Embed via DINOv3 (Replicate Edge Function)
     d. Apply probe-v4 projection (NumPy)
     e. Upsert watches + image_embeddings rows
  3. price_market_excellent/good/fair gets filled from CSV price_thb

═══════════════════════════════════════════════════════════════════════════
USAGE:

  # Dry-run for one brand (no embed calls, no DB writes)
  python3 scripts/index_thai_boutique.py --brand Seiko --dry-run

  # Smoke test on a single collection
  python3 scripts/index_thai_boutique.py --brand Seiko --collection PROSPEX --limit 10

  # Full brand index
  python3 scripts/index_thai_boutique.py --brand Seiko

  # ALL 13 brands (overnight, ~31K images, ~$44 ≈ ฿1,500)
  for b in Seiko Rolex Patek Omega TagHeuer Cartier AudermarsPiguet \\
           Panerai Tudor IWC Corum SevenFriday; do
    python3 scripts/index_thai_boutique.py --brand "$b"
  done

═══════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import logging
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Iterable

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

try:
    import numpy as np
    import httpx
    from PIL import Image
except ImportError as e:
    print(f"❌ Missing dep: {e}\n   Run: pip install numpy httpx pillow", file=sys.stderr)
    sys.exit(1)

log = logging.getLogger("idx_thai")

ROOT = Path("/Users/kritsada/Desktop/Luxury Watch")
PROBE_WEIGHTS = Path(__file__).resolve().parent / "output" / "probe_v4_weights.npz"

# Folder → canonical brand display name
BRAND_FOLDER_MAP = {
    "AudermarsPiguet": "Audemars Piguet",
    "CARTIER":         "Cartier",
    "Corum":           "Corum",
    "GrandSeiko":     "Grand Seiko",
    "IWC":             "IWC",
    "Omega":           "Omega",
    "Panerai":         "Panerai",
    "Patek":           "Patek Philippe",
    "Rolex":           "Rolex",
    "Seiko":           "Seiko",
    "SevenFriday":     "SevenFriday",
    "TagHeuer":        "TAG Heuer",
    "Tudor":           "Tudor",
    # "Others" intentionally NOT mapped — needs manual brand detection
}

# Filename pattern: '<SKU>__<rest>.<ext>'
SKU_RE = re.compile(r"^([A-Z0-9._\-]+?)__")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif"}


def _slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "unknown"


def _parse_float(s: str | None) -> float | None:
    s = (s or "").replace(",", "").strip()
    try:
        return float(s) if s else None
    except ValueError:
        return None


def _load_catalog(csv_path: Path) -> tuple[dict[str, dict], str]:
    """Parse _catalog.csv. Auto-detects schema and returns (lookup, mode).

    Two known schemas across our scrape sources:

      Schema A — Thai boutique (Seiko / Grand Seiko via WooCommerce):
          sku, name, price_thb, permalink
        → lookup keyed by SKU; images matched by '<SKU>__' filename prefix.
        → mode = "sku_prefix"

      Schema B — Rolex marketplace (newforum/Akamai scrape):
          filename, model, name, price_thb, source_url
        → lookup keyed by EXACT filename; `model` becomes the reference.
        → mode = "filename"

    Returns ({key: {name, reference, price_thb, permalink}}, mode).
    """
    if not csv_path.exists():
        return {}, "none"
    out: dict[str, dict] = {}
    mode = "none"
    try:
        with csv_path.open() as f:
            reader = csv.DictReader(f)
            cols = set(reader.fieldnames or [])
            if "filename" in cols:
                mode = "filename"
            elif "sku" in cols:
                mode = "sku_prefix"
            else:
                log.warning("Unknown catalog schema %s in %s", cols, csv_path)
                return {}, "none"

            for row in reader:
                if mode == "sku_prefix":
                    key = (row.get("sku") or "").strip()
                    reference = key
                else:  # filename mode
                    key = (row.get("filename") or "").strip()
                    reference = (row.get("model") or key).strip()
                if not key:
                    continue
                out[key] = {
                    "name": (row.get("name") or "").strip(),
                    "reference": reference,
                    "price_thb": _parse_float(row.get("price_thb")),
                    "permalink": (row.get("permalink") or row.get("source_url") or "").strip(),
                }
    except Exception as e:
        log.warning("CSV parse failed for %s: %s", csv_path, e)
        return {}, "none"
    return out, mode


def _iter_collections(brand_folder: str) -> Iterable[tuple[Path, dict[str, dict], str]]:
    """Yield (collection_dir, catalog, mode) per sub-folder under the brand.

    Some brands (Rolex) also keep a root-level _catalog.csv + images directly
    under the brand folder. We yield the brand root itself as a pseudo-
    collection when it has its own catalog + loose image files.
    """
    brand_root = ROOT / brand_folder
    if not brand_root.exists():
        log.warning("Brand folder not found: %s", brand_root)
        return

    # Root-level catalog (Rolex marketplace dumps images at brand root)
    root_csv = brand_root / "_catalog.csv"
    root_cat, root_mode = _load_catalog(root_csv)
    if root_cat:
        yield brand_root, root_cat, root_mode

    for sub in sorted(brand_root.iterdir()):
        if not sub.is_dir():
            continue
        csv_path = sub / "_catalog.csv"
        catalog, mode = _load_catalog(csv_path)
        if catalog:
            yield sub, catalog, mode
        else:
            log.info("  %s has no _catalog.csv — skipping", sub.name)


def _parse_sku(filename: str) -> str | None:
    m = SKU_RE.match(filename)
    return m.group(1) if m else None


def _lookup_catalog(filename: str, catalog: dict[str, dict], mode: str) -> tuple[str | None, dict | None]:
    """Resolve a catalog entry for an image filename based on schema mode.

    Returns (matched_key, entry) or (None, None) if no match.
      • sku_prefix mode → extract '<SKU>__' prefix, look up by SKU
      • filename mode    → exact filename match
    """
    if mode == "sku_prefix":
        sku = _parse_sku(filename)
        if sku and sku in catalog:
            return sku, catalog[sku]
        return None, None
    elif mode == "filename":
        if filename in catalog:
            return filename, catalog[filename]
        return None, None
    return None, None


# Aspect-ratio quality gate. Images that are very wide or very tall are
# almost certainly banner ads, sidebar promos, or catalog spreads — NOT
# product shots. DINOv3 would still produce a vector, but the vector
# represents the banner content (text, logo, gradient) rather than the
# watch silhouette, which pollutes the brand cluster centroid in
# image_embeddings.
#
# Real watch product shots are square (1:1) or portrait/landscape close
# to square (≤ 1.5:1 either direction). Boutique CMS shots are usually
# exactly square. Allow up to 2:1 to be safe.
MAX_ASPECT_RATIO = 2.0

# Minimum dimensions — under this is favicon/thumbnail territory,
# embedding quality degrades sharply for small inputs.
MIN_IMAGE_DIM = 200


def _is_product_shot(path: Path) -> tuple[bool, str]:
    """Quality gate run before embedding. Returns (ok, reason_if_skipped).

    Filters out:
      • Files Pillow can't parse (HTML error pages saved as .jpg, partial
        downloads, corrupt JPEGs)
      • Extreme aspect ratios > 2:1 (banner ads, sidebar promos)
      • Tiny images < 200px on either side (favicons, sprites)

    Does NOT filter:
      • Content of the image (we trust source quality + SKIP_PATTERNS).
        A studio shot of a watch on a person's wrist still passes — the
        wrist+watch composition gives DINOv3 enough signal to cluster
        with other wrist shots of the same model.
    """
    try:
        with Image.open(path) as img:
            img.verify()
        with Image.open(path) as img:
            w, h = img.size
    except Exception as e:
        return False, f"unparseable ({type(e).__name__})"

    if w < MIN_IMAGE_DIM or h < MIN_IMAGE_DIM:
        return False, f"too small ({w}x{h})"

    ratio = max(w / h, h / w)
    if ratio > MAX_ASPECT_RATIO:
        return False, f"extreme aspect ratio {ratio:.2f}:1 ({w}x{h}) — likely banner/strip"

    return True, ""


def _load_image_bytes(path: Path) -> tuple[bytes, str]:
    """Read bytes + infer MIME type. Transcode AVIF → JPEG (Replicate Pillow
    can't handle AVIF, same workaround as index_to_image_embeddings.py)."""
    ext = path.suffix.lower()
    if ext == ".avif":
        # Transcode in-memory; do NOT touch the original
        with Image.open(path) as img:
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=92)
            return buf.getvalue(), "image/jpeg"
    mime = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
    }.get(ext, "image/jpeg")
    return path.read_bytes(), mime


def _embed_via_edge(img_bytes: bytes, mime: str,
                    supabase_url: str, anon_jwt: str) -> np.ndarray:
    """Call Supabase embed-image Edge Function → 1024d DINOv3 vector."""
    b64 = base64.standard_b64encode(img_bytes).decode("ascii")
    r = httpx.post(
        f"{supabase_url}/functions/v1/embed-image",
        headers={"Authorization": f"Bearer {anon_jwt}", "Content-Type": "application/json"},
        json={"image": f"data:{mime};base64,{b64}"},
        timeout=120.0,
    )
    if r.status_code != 200:
        raise RuntimeError(f"embed-image HTTP {r.status_code}: {r.text[:200]}")
    data = r.json()
    vec = data.get("embedding") or data.get("vector")
    if not vec or len(vec) != 1024:
        raise RuntimeError(f"Unexpected embed response shape: {list(data.keys())}")
    return np.array(vec, dtype=np.float32)


def _gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + np.tanh(np.sqrt(2.0 / np.pi) * (x + 0.044715 * x**3)))


def _project_256(vec_1024: np.ndarray, probe: dict) -> np.ndarray:
    x = vec_1024.astype(np.float32).reshape(1, -1)
    h = _gelu(x @ probe["W1"].T + probe["b1"])
    y = h @ probe["W2"].T + probe["b2"]
    n = np.linalg.norm(y, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return (y / n).astype(np.float32).flatten()


def _load_probe(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"probe weights missing: {path}")
    d = np.load(path, allow_pickle=True)
    return {
        "W1": d["W1"].astype(np.float32),
        "b1": d["b1"].astype(np.float32).flatten(),
        "W2": d["W2"].astype(np.float32),
        "b2": d["b2"].astype(np.float32).flatten(),
    }


def _supabase_headers(service_key: str) -> dict:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


def _upsert_watch_and_embedding(
    supabase_url: str, service_key: str, anon_jwt: str,
    *, watch_id: str, brand: str, name: str, reference: str,
    price_thb: float | None, permalink: str,
    collection: str, image_path: Path,
    vec_1024: np.ndarray, vec_256: np.ndarray,
) -> bool:
    """Upsert (watches, image_embeddings) for this image. Returns True on success."""
    image_url = f"local://{_slug(brand)}/{_slug(collection)}/{image_path.name}"

    # Convert price THB → USD integer for compatibility with existing
    # price_market_* columns (typed bigint in Postgres). 1 USD ≈ 35 THB.
    usd_est = (price_thb / 35.0) if price_thb else None
    # Conservative grade-band split (typical secondary market spread):
    # excellent ≈ 1.0×, good ≈ 0.92×, fair ≈ 0.80×
    p_exc = int(round(usd_est)) if usd_est else None
    p_good = int(round(usd_est * 0.92)) if usd_est else None
    p_fair = int(round(usd_est * 0.80)) if usd_est else None

    watches_row = {
        "id": watch_id,
        "brand": brand,
        "name": name[:200],  # safety truncate
        "reference": reference,
        "category": "others",
        "movement_family": "Mechanical",
        "case_material": "Stainless Steel",
        "dial_color": "Black",
        "year_created": "2024",
        "difficulty": "medium",
        "price_market_excellent": p_exc or 2000,
        "price_market_good": p_good or 1500,
        "price_market_fair": p_fair or 1200,
        "price_trend": "stable",
        "price_last_updated": "2026-05-28",
        "history": (permalink or f"Reference exemplar from Thai boutique scrape ({collection}).")[:500],
        "significance": "Thai boutique visual reference (not for display).",
        "data_confidence": "high",  # official boutique source
    }

    # 1. Upsert watches row
    r = httpx.post(
        f"{supabase_url}/rest/v1/watches?on_conflict=id",
        headers={**_supabase_headers(service_key),
                 "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=watches_row, timeout=30.0,
    )
    if not (200 <= r.status_code < 300):
        log.warning("watches upsert HTTP %d: %s", r.status_code, r.text[:200])
        return False

    # 2. Check if image_embeddings row already exists (skip duplicate embeds)
    r = httpx.get(
        f"{supabase_url}/rest/v1/image_embeddings?image_url=eq.{httpx.QueryParams({'u': image_url})['u']}&select=id&limit=1",
        headers=_supabase_headers(service_key), timeout=30.0,
    )
    if r.status_code == 200 and r.json():
        return True  # idempotent skip

    # 3. Insert image_embeddings row (schema matches index_to_image_embeddings.py)
    emb_row = {
        "watch_id": watch_id,
        "image_url": image_url,
        "image_embedding": vec_1024.tolist(),
        "image_embedding_v2": vec_256.tolist(),
        "embedding_source": "ref",
    }
    r = httpx.post(
        f"{supabase_url}/rest/v1/image_embeddings",
        headers={**_supabase_headers(service_key), "Prefer": "return=minimal"},
        json=emb_row, timeout=60.0,
    )
    if not (200 <= r.status_code < 300):
        log.warning("image_embeddings insert HTTP %d: %s", r.status_code, r.text[:200])
        return False
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--brand", required=True, help="Brand folder name (e.g. Seiko, Rolex)")
    ap.add_argument("--collection", help="Limit to one collection sub-folder")
    ap.add_argument("--limit", type=int, default=0, help="Max images this run (0 = all)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    brand_display = BRAND_FOLDER_MAP.get(args.brand)
    if not brand_display:
        raise SystemExit(f"brand folder '{args.brand}' not in BRAND_FOLDER_MAP. "
                         f"Known: {list(BRAND_FOLDER_MAP)}")

    supabase_url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    anon_jwt = (os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")
                or os.environ.get("SUPABASE_ANON_KEY", ""))
    if not args.dry_run and not (supabase_url and service_key and anon_jwt):
        raise SystemExit("missing SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY")

    probe = _load_probe(PROBE_WEIGHTS) if not args.dry_run else None

    counts = {
        "new": 0, "skipped": 0, "failed": 0, "no_sku": 0, "no_catalog": 0,
        "skipped_quality": 0,  # aspect ratio / size / corrupt
    }
    seen_images = 0
    t0 = time.time()

    for coll_dir, catalog, mode in _iter_collections(args.brand):
        if args.collection and coll_dir.name != args.collection:
            continue
        images = sorted([p for p in coll_dir.iterdir()
                         if p.is_file() and p.suffix.lower() in IMAGE_EXTS])
        log.info("─── %s (%d images, %d catalog rows, mode=%s) ───",
                 coll_dir.name, len(images), len(catalog), mode)
        for img in images:
            if args.limit and seen_images >= args.limit:
                log.info("Hit --limit %d, stopping", args.limit)
                break
            seen_images += 1

            # Resolve metadata via schema-aware lookup (sku_prefix | filename)
            key, cat = _lookup_catalog(img.name, catalog, mode)
            if not cat:
                # In sku_prefix mode, missing key usually means filename had
                # no '<SKU>__' prefix. In filename mode, image not in catalog.
                if mode == "sku_prefix" and not _parse_sku(img.name):
                    counts["no_sku"] += 1
                else:
                    counts["no_catalog"] += 1
                continue

            reference = cat["reference"]

            # Quality gate — drop banner / corrupt / tiny images BEFORE
            # paying for a Replicate embed call. Saves ~$0.0014 per skip
            # and (more importantly) keeps the brand cluster centroid
            # clean from non-product noise.
            ok, reason = _is_product_shot(img)
            if not ok:
                log.info("[%d] %s SKIPPED — %s", seen_images, img.name, reason)
                counts["skipped_quality"] += 1
                continue

            watch_id = f"{_slug(brand_display)}-{_slug(coll_dir.name)}-{_slug(reference)}"
            log.info("[%d] %s → %s / %s (฿%s)",
                     seen_images, img.name, brand_display, reference,
                     f"{int(cat['price_thb']):,}" if cat.get("price_thb") else "?")

            if args.dry_run:
                continue

            try:
                img_bytes, mime = _load_image_bytes(img)
                vec_1024 = _embed_via_edge(img_bytes, mime,
                                           supabase_url=supabase_url, anon_jwt=anon_jwt)
                vec_256 = _project_256(vec_1024, probe)
            except Exception as e:
                log.warning("embed failed for %s: %s", img.name, e)
                counts["failed"] += 1
                continue

            ok = _upsert_watch_and_embedding(
                supabase_url, service_key, anon_jwt,
                watch_id=watch_id, brand=brand_display,
                name=cat["name"] or f"{brand_display} {reference}",
                reference=reference,
                price_thb=cat.get("price_thb"),
                permalink=cat.get("permalink", ""),
                collection=coll_dir.name,
                image_path=img,
                vec_1024=vec_1024, vec_256=vec_256,
            )
            if ok:
                counts["new"] += 1
            else:
                counts["failed"] += 1

        if args.limit and seen_images >= args.limit:
            break

    dt = time.time() - t0
    print("")
    print("═" * 60)
    print(f"  Brand:            {brand_display}")
    print(f"  Images scanned:   {seen_images}")
    print(f"  ✓ Indexed:        {counts['new']}")
    print(f"  ✗ No SKU prefix:  {counts['no_sku']}")
    print(f"  ✗ No catalog row: {counts['no_catalog']}")
    print(f"  ✗ Quality gate:   {counts['skipped_quality']}  (banner/tiny/corrupt)")
    print(f"  ✗ Embed failed:   {counts['failed']}")
    print(f"  Elapsed:          {dt:.1f}s")
    cost = counts['new'] * 0.0014
    print(f"  Replicate cost:   ~${cost:.2f} (~฿{cost*35:.0f})")
    print("═" * 60)


if __name__ == "__main__":
    main()
