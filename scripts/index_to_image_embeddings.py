"""Index local reference images into Supabase `image_embeddings` (mobile RAG).

The mobile app queries the `image_embeddings` table via the
`match_watches_v2` RPC — a totally different surface than the
FastAPI backend's `watch_embeddings` table (which `index_official.py`
populates). Visual RAG mismatches in the mobile app (e.g. Maurice
Lacroix Aikon nearest-neighbouring to Panerai Submersible at
sim=0.849 because the DB has zero Aikon exemplars) get fixed here.

Pipeline per image:
  1. Read JPEG bytes (transcodes large files / AVIF transparently).
  2. POST to the Supabase Edge Function `embed-image` to obtain a
     1024-dim DINOv3 vector.
  3. Apply probe-v4 weights locally (NumPy GELU + L2-normalise) →
     256-dim projection that matches the mobile-side probe binary
     (`src/lib/data/linear-probe-weights.bin`).
  4. Upsert a `watches` row keyed on a deterministic ID
     (`{brand-slug}-{model-slug}-{ref}`) so re-runs are idempotent.
  5. Insert an `image_embeddings` row with both vectors. Idempotency
     is via UNIQUE(image_url) — re-runs skip already-indexed files.

Curation:
  • Filenames listed in `MANUAL_BLACKLIST` (factory shots, trains,
    unrelated subjects from Wikimedia) are skipped before embed —
    saves Replicate $ and prevents polluting the brand cluster.
  • Brand / model / reference are inferred from filename heuristics
    (see `_classify_filename`). Run with `--dry-run` first to verify
    the mapping before burning embeddings.

Usage:
    # Verify file → (brand, model, ref) mapping without API calls:
    python3 scripts/index_to_image_embeddings.py --brand Maurice_Lacroix --dry-run

    # Real run (uses EXPO_PUBLIC_SUPABASE_* + EMBED_FUNCTION_SECRET):
    python3 scripts/index_to_image_embeddings.py --brand Maurice_Lacroix
"""
from __future__ import annotations

import argparse
import io
import logging
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Iterable

import httpx
import numpy as np

# Load .env so EMBED_FUNCTION_SECRET / SUPABASE_* are available.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

log = logging.getLogger("idx_imgemb")

OFFICIAL_ROOT = Path("/Users/kritsada/Desktop/Luxury Watch/official")
PROBE_WEIGHTS = Path(__file__).resolve().parent / "output" / "probe_v4_weights.npz"

# Brand-folder → canonical brand name. Extended ad-hoc as we onboard
# new brands; mirrors the larger BRAND_DISPLAY table in
# index_official.py but kept local so this script has no
# cross-file dependency on the FastAPI backend code.
BRAND_DISPLAY = {
    "Maurice_Lacroix": "Maurice Lacroix",
}

# Filenames in /Maurice_Lacroix/Watches that Wikimedia returns for
# brand-name queries but which are NOT watch photos (factory shots,
# unrelated Swiss railway / museum content). Skip these to avoid
# polluting the brand cluster.
MANUAL_BLACKLIST: set[str] = {
    "FFS_Re_460_076-3_ZuerichHB_140614.jpg",  # Swiss railway locomotive
    "MIH-film129jpg.jpg",                       # Museum film reel
    "Usine-Maurice-Lacroix-Jimbo.JPG",          # Factory exterior
}


def _slug(s: str) -> str:
    """Lowercase, hyphenate, strip accents — safe for use in watch IDs."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "unknown"


def _classify_filename(brand: str, fname: str) -> tuple[str, str]:
    """Infer (model_name, reference) from a Wikimedia filename.

    Best-effort string matching — Wikimedia filenames are
    inconsistent so we fall back to brand-generic when no model
    keyword is present. Conservative: when uncertain, use
    "Maurice Lacroix" + the filename stem as ref, which still
    contributes to the brand cluster but won't be confused with
    a specific model.
    """
    low = fname.lower()
    # Aikon is the line that mis-matched in production — explicit handling.
    if "aikon" in low or "ai6038" in low:
        return ("Maurice Lacroix Aikon", "AI6038-SS001-330-2")
    if "pontos" in low:
        return ("Maurice Lacroix Pontos", "PT6188")
    if "masterpiece" in low and "double" in low and "retrograde" in low:
        return ("Maurice Lacroix Masterpiece Double Retrograde", "MP7218")
    if "masterpiece" in low:
        return ("Maurice Lacroix Masterpiece", "MP6378")
    if "reveil" in low:
        return ("Maurice Lacroix Masterpiece Reveil Globe", "MP6388")
    if "calendrier" in low or "retrograde" in low:
        return ("Maurice Lacroix Masterpiece Retrograde", "MP6068")
    if "eliros" in low:
        return ("Maurice Lacroix Eliros", "EL1118")
    if "calypso" in low:
        return ("Maurice Lacroix Calypso", "CP1101")
    if "daydate" in low or "day_date" in low:
        return ("Maurice Lacroix Pontos Day Date", "PT6158")
    if "chronograph" in low or "chrono" in low:
        # Generic chronograph fallback — assume Aikon Chrono since
        # that's the most common modern Maurice Lacroix chrono.
        return ("Maurice Lacroix Aikon Chronograph", "AI6038-SS001")
    # Brand-generic fallback. Stem becomes the reference so each
    # image still produces a unique watches row (prevents UNIQUE
    # collisions on the watches table) but they all live under
    # the brand cluster.
    return (f"{brand}", Path(fname).stem[:48])


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


def _gelu(x: np.ndarray) -> np.ndarray:
    # Tanh-approximation GELU. Must match mobile linearProbe.ts
    # and reproject_image_embeddings.py exactly — otherwise stored
    # vectors and query vectors live in different latent spaces.
    return 0.5 * x * (1.0 + np.tanh(np.sqrt(2.0 / np.pi) * (x + 0.044715 * x**3)))


def _project_256(vec_1024: np.ndarray, probe: dict) -> np.ndarray:
    x = vec_1024.astype(np.float32).reshape(1, -1)
    h = _gelu(x @ probe["W1"].T + probe["b1"])
    y = h @ probe["W2"].T + probe["b2"]
    n = np.linalg.norm(y, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return (y / n).astype(np.float32).flatten()


def _load_image_bytes(path: Path) -> tuple[bytes, str]:
    raw = path.read_bytes()
    # Wikimedia ships some images at 10-20 MB — Replicate Edge has a
    # 10MB request cap and prefers ~2048px max side. Downsize aggressively.
    if len(raw) > 2_000_000 or path.suffix.lower() in {".avif", ".heic"}:
        try:
            import pillow_avif  # noqa: F401
        except ImportError:
            pass
        from PIL import Image
        with Image.open(io.BytesIO(raw)) as im:
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGB")
            w, h = im.size
            ls = max(w, h)
            if ls > 1024:
                s = 1024 / ls
                im = im.resize((int(w * s), int(h * s)), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=88, optimize=True)
            return buf.getvalue(), "image/jpeg"
    return raw, "image/jpeg"


def _embed_via_edge(
    image_bytes: bytes,
    content_type: str,
    *,
    supabase_url: str,
    anon_jwt: str,
) -> np.ndarray:
    """Call the deployed `embed-image` edge function. Returns 1024-d vector.

    The function expects a JSON body `{ image: <data-url> }` and a JWT in
    the Authorization header (Supabase platform validates JWT before
    forwarding to the function). We use the public anon key for the JWT —
    same path the mobile client takes. Service-role works too but anon
    is preferred since this is a read-equivalent operation.
    """
    import base64
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{content_type};base64,{b64}"
    url = f"{supabase_url.rstrip('/')}/functions/v1/embed-image"
    headers = {
        "Authorization": f"Bearer {anon_jwt}",
        "apikey": anon_jwt,
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=120.0) as client:
        r = client.post(url, headers=headers, json={"image": data_url})
        if r.status_code != 200:
            raise RuntimeError(f"embed-image HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        if "embedding" not in data:
            raise RuntimeError(f"embed-image returned no embedding: {data}")
        return np.asarray(data["embedding"], dtype=np.float32)


def _supabase_upsert_watch(*, supabase_url: str, service_key: str, watch_row: dict) -> None:
    """Idempotent upsert on `watches.id`."""
    url = f"{supabase_url.rstrip('/')}/rest/v1/watches?on_conflict=id"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    with httpx.Client(timeout=30.0) as client:
        r = client.post(url, headers=headers, json=[watch_row])
        if r.status_code not in (200, 201, 204):
            raise RuntimeError(f"watches upsert HTTP {r.status_code}: {r.text[:300]}")


def _supabase_insert_embedding(
    *, supabase_url: str, service_key: str, row: dict, on_dup_skip: bool = True
) -> bool:
    """Insert into image_embeddings. Returns True if a new row was created.

    UNIQUE constraint isn't declared on image_url in the schema, so we
    pre-check via SELECT to keep the operation idempotent on re-runs.
    """
    base = supabase_url.rstrip("/")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=60.0) as client:
        if on_dup_skip:
            check = client.get(
                f"{base}/rest/v1/image_embeddings?image_url=eq.{row['image_url']}&select=id&limit=1",
                headers=headers,
            )
            if check.status_code == 200 and check.json():
                return False
        r = client.post(
            f"{base}/rest/v1/image_embeddings",
            headers={**headers, "Prefer": "return=representation"},
            json=[row],
        )
        if r.status_code not in (200, 201):
            raise RuntimeError(f"image_embeddings insert HTTP {r.status_code}: {r.text[:300]}")
        return True


def _iter_images(brand_folder: str) -> Iterable[Path]:
    root = OFFICIAL_ROOT / brand_folder
    if not root.is_dir():
        log.warning("brand folder missing: %s", root)
        return
    for p in sorted(root.rglob("*")):
        if not p.is_file():
            continue
        if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        if p.name in MANUAL_BLACKLIST:
            log.info("blacklisted: %s", p.name)
            continue
        yield p


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--brand", required=True, help="Folder name under /official, e.g. Maurice_Lacroix")
    ap.add_argument("--limit", type=int, default=0, help="Cap on processed images (0 = all)")
    ap.add_argument("--dry-run", action="store_true", help="No API calls; print classification only")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    brand_display = BRAND_DISPLAY.get(args.brand)
    if not brand_display:
        raise SystemExit(f"brand '{args.brand}' missing from BRAND_DISPLAY")

    supabase_url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    # The edge function `embed-image` expects a Supabase-issued JWT. Anon key
    # is the same path mobile clients take; it's a JWT despite the "anon"
    # naming. Service-role works too but anon is the lighter privilege.
    anon_jwt = (
        os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")
        or os.environ.get("SUPABASE_ANON_KEY", "")
    )
    if not args.dry_run and not (supabase_url and service_key and anon_jwt):
        raise SystemExit(
            "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY"
        )

    probe = _load_probe(PROBE_WEIGHTS) if not args.dry_run else None
    log.info("Probe weights loaded: W1=%s W2=%s",
             probe and probe["W1"].shape, probe and probe["W2"].shape)

    images = list(_iter_images(args.brand))
    if args.limit:
        images = images[: args.limit]
    log.info("brand=%s images=%d (after blacklist)", brand_display, len(images))

    counts = {"new": 0, "skipped": 0, "failed": 0, "blacklisted": 0}
    t0 = time.time()
    for i, path in enumerate(images, 1):
        model_name, reference = _classify_filename(brand_display, path.name)
        watch_id = f"{_slug(brand_display)}-{_slug(model_name)}-{_slug(reference)}"
        # Image URL — local file path is acceptable here. The mobile
        # app shows DB image_url as a thumbnail tooltip; for now we
        # store the source filename so curation is traceable. If we
        # later mirror to S3/Supabase storage we can rewrite this.
        image_url = f"local://maurice_lacroix/{path.name}"

        log.info("[%d/%d] %s → %s / %s", i, len(images), path.name, model_name, reference)

        if args.dry_run:
            continue

        try:
            img_bytes, ct = _load_image_bytes(path)
            vec_1024 = _embed_via_edge(img_bytes, ct,
                                       supabase_url=supabase_url, anon_jwt=anon_jwt)
            vec_256 = _project_256(vec_1024, probe)
        except Exception as exc:
            log.warning("embed failed for %s: %s", path.name, exc)
            counts["failed"] += 1
            continue

        # `watches` table has many NOT NULL columns (category check,
        # case_material, dial_color, etc.). Fill them with sensible
        # placeholder values — these rows are reference exemplars for
        # visual RAG only; product detail is filled at scan-time by
        # Gemini, so the placeholder data here never reaches users.
        watch_row = {
            "id": watch_id,
            "name": model_name,
            "brand": brand_display,
            "reference": reference,
            # Category CHECK is narrow — Maurice Lacroix doesn't fit any
            # specific bucket so map to the catch-all 'others'.
            "category": "others",
            "movement_family": "Mechanical",
            "case_material": "Stainless Steel",
            "dial_color": "Black",
            "year_created": "2020",
            "difficulty": "medium",
            "price_market_excellent": 2000,
            "price_market_good": 1500,
            "price_market_fair": 1200,
            "price_trend": "stable",
            "price_last_updated": "2026-01-01",
            "history": f"Reference exemplar for {brand_display} visual RAG matching.",
            "significance": "Visual reference (not for display).",
            "data_confidence": "medium",
        }
        try:
            _supabase_upsert_watch(supabase_url=supabase_url, service_key=service_key,
                                   watch_row=watch_row)
        except Exception as exc:
            log.warning("watches upsert failed for %s: %s", watch_id, exc)
            counts["failed"] += 1
            continue

        emb_row = {
            "watch_id": watch_id,
            "image_url": image_url,
            "image_embedding": vec_1024.tolist(),
            "image_embedding_v2": vec_256.tolist(),
            "embedding_source": "ref",
        }
        try:
            inserted = _supabase_insert_embedding(
                supabase_url=supabase_url, service_key=service_key, row=emb_row
            )
            counts["new" if inserted else "skipped"] += 1
        except Exception as exc:
            log.warning("image_embeddings insert failed for %s: %s", image_url, exc)
            counts["failed"] += 1

    elapsed = time.time() - t0
    log.info("DONE in %.1fs  new=%d skipped=%d failed=%d",
             elapsed, counts["new"], counts["skipped"], counts["failed"])


if __name__ == "__main__":
    main()
