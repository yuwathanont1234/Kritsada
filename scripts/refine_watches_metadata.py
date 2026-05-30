"""Refine watches.name + watches.reference via Gemini Flash.

═══════════════════════════════════════════════════════════════════════════
WHY: After scripts/index_to_image_embeddings.py runs, each `watches` row
has placeholder metadata:

    name      = brand display (e.g. "Hublot")
    reference = filename stem (e.g. "c24apify__bf1aa67cdc056370")

This makes ResultScreen render unhelpful labels ("Hublot c24apify__..."),
and makes the model + reference unsearchable. Gemini Flash can look at
the image and recover the real model name (e.g. "Big Bang Unico") plus
the canonical manufacturer reference (e.g. "411.NX.1170.RX").

═══════════════════════════════════════════════════════════════════════════
IDEMPOTENCY:

Rows where `name` already differs from the brand display AND contains
something more specific (length > brand display length, OR contains a
digit) are considered "already refined" and skipped on re-run. Re-running
is therefore safe — only newly-imported rows are touched.

═══════════════════════════════════════════════════════════════════════════
USAGE:

    # Dry-run for one brand (no Gemini calls, no DB writes)
    python scripts/refine_watches_metadata.py --brand Hublot --dry-run

    # Refine all unrefined Hublot rows
    python scripts/refine_watches_metadata.py --brand Hublot

    # All brands at once (overnight)
    for b in A_Lange_Sohne FP_Journe Jaeger_LeCoultre Hublot \\
             Breitling Zenith Bvlgari Franck_Muller \\
             Girard_Perregaux MB_F URWERK Bovet \\
             Ulysse_Nardin Parmigiani_Fleurier Longines Seiko; do
      python scripts/refine_watches_metadata.py --brand "$b"
    done

═══════════════════════════════════════════════════════════════════════════
COST: ~$0.005/image (Gemini 2.5 Flash, 1 image + ~200-token prompt).
      750 images × $0.005 = ~$3.75 ≈ ฿130 for all 15 brands.

═══════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

try:
    import httpx
except ImportError:
    print("❌ httpx not installed. Run:  pip install httpx", file=sys.stderr)
    sys.exit(1)

log = logging.getLogger("refine_watches")

# Must match BRAND_DISPLAY in index_to_image_embeddings.py
BRAND_DISPLAY = {
    "Maurice_Lacroix":     "Maurice Lacroix",
    "A_Lange_Sohne":       "A. Lange & Söhne",
    "FP_Journe":           "F.P. Journe",
    "Jaeger_LeCoultre":    "Jaeger-LeCoultre",
    "Hublot":              "Hublot",
    "Breitling":           "Breitling",
    "Zenith":              "Zenith",
    "Bvlgari":             "Bvlgari",
    "Franck_Muller":       "Franck Muller",
    "Girard_Perregaux":    "Girard-Perregaux",
    "MB_F":                "MB&F",
    "URWERK":              "URWERK",
    "Bovet":               "Bovet",
    "Ulysse_Nardin":       "Ulysse Nardin",
    "Parmigiani_Fleurier": "Parmigiani Fleurier",
    "Longines":            "Longines",
    "Seiko":               "Seiko",
}

OFFICIAL_ROOT = Path("/Users/kritsada/Desktop/Luxury Watch/official")
LOG_PATH = Path(__file__).resolve().parent / "output" / "refine_watches_log.jsonl"

GEMINI_FLASH_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash:generateContent"
)
PROMPT_TEMPLATE = """You are a luxury watch expert. Look at this image of a watch.

The brand is already known to be: {brand}

Return STRICT JSON in this shape (no markdown, no commentary):
{{
  "model_name": "<short product line + variant, e.g. 'Big Bang Unico Titanium 42mm' or 'Submariner Date'>",
  "reference":  "<manufacturer reference code if visible or known, e.g. '411.NX.1170.RX' or '126610LN'; use null if unsure>",
  "confidence": <0.0 to 1.0, your confidence that brand + model are correct>,
  "is_genuine_brand": <true if image is genuinely a {brand}, false if mislabeled or counterfeit-looking>
}}

Rules:
- If you cannot identify the specific model, set model_name to a sensible collection name (e.g. "Big Bang") and reference to null.
- If the image is not actually a {brand} watch (mislabeled scrape result), set is_genuine_brand to false.
- Confidence < 0.5 means low-confidence guess; the caller will skip the update."""


def _slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "unknown"


def _is_already_refined(name: str, brand_display: str) -> bool:
    """Heuristic: row counts as 'refined' if `name` looks more specific
    than the bare brand display. Specifically:
      • length > brand_display length, AND
      • contains a digit (most ref codes do) OR is 3+ extra words

    Examples:
      brand="Hublot", name="Hublot"                       → unrefined
      brand="Hublot", name="Hublot Big Bang Unico"        → refined
      brand="Hublot", name="Hublot 411.NX.1170.RX"        → refined
    """
    if not name or name.strip() == brand_display.strip():
        return False
    if len(name) <= len(brand_display) + 2:
        return False
    extra = name.replace(brand_display, "").strip()
    if any(c.isdigit() for c in extra):
        return True
    if len(extra.split()) >= 2:  # at least 2 extra words = "Big Bang", etc.
        return True
    return False


def _supabase_headers(service_key: str) -> dict:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


def _fetch_unrefined_rows(
    supabase_url: str, service_key: str, brand_display: str, limit: int
) -> list[dict]:
    """Pull watches rows for the brand. Filter unrefined locally so we
    don't have to express the heuristic in PostgREST query syntax.

    NOTE: the `watches` table doesn't carry an image_url column —
    the image lives on `image_embeddings.image_url`. We don't need the
    URL here because we derive the disk path from the (deterministic)
    reference field, which is the filename stem at index time.
    """
    # PostgREST encodes the value side automatically; just pass the brand
    # name with spaces/special-chars URL-encoded normally.
    from urllib.parse import quote
    url = (
        f"{supabase_url}/rest/v1/watches"
        f"?brand=eq.{quote(brand_display)}"
        f"&select=id,brand,name,reference"
        f"&limit={limit * 4}"  # over-fetch since we filter locally
    )
    r = httpx.get(url, headers=_supabase_headers(service_key), timeout=30.0)
    r.raise_for_status()
    rows = r.json()
    unrefined = [
        row for row in rows
        if not _is_already_refined(row.get("name", ""), brand_display)
    ]
    return unrefined[:limit]


def _disk_path_for_row(row: dict, brand_folder: str) -> Path | None:
    """Find the source image file for a watches row.

    `index_to_image_embeddings.py` sets reference = filename stem
    (e.g. "c24apify__bf1aa67cdc056370" or "Big_Bang_421.EX_.5129.NR")
    when no model-specific classifier fired. The extension was dropped,
    so we glob the brand folder recursively for any matching file.

    NOTE: indexer uses rglob("*") to walk subfolders like
    /official/Hublot/Big_Bang/foo.png, NOT just /official/Hublot/Watches.
    We must do the same.
    """
    ref = row.get("reference", "")
    if not ref:
        return None
    brand_root = OFFICIAL_ROOT / brand_folder
    if not brand_root.exists():
        return None

    # Try exact filename + known extensions first (most common case)
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".avif"):
        matches = list(brand_root.rglob(f"{ref}{ext}"))
        if matches:
            return matches[0]
    # Prefix match — handles truncation in indexer (stem[:48])
    matches = list(brand_root.rglob(f"{ref}*"))
    matches = [m for m in matches if m.is_file() and m.suffix.lower()
               in (".jpg", ".jpeg", ".png", ".webp", ".avif")]
    return matches[0] if matches else None


def _image_b64(path: Path) -> tuple[str, str] | None:
    """Returns (base64_data, mime_type) or None on failure."""
    ext = path.suffix.lower()
    mime = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
    }.get(ext, "image/jpeg")
    try:
        b = path.read_bytes()
        return base64.standard_b64encode(b).decode("ascii"), mime
    except Exception as e:
        log.warning("read failed %s: %s", path, e)
        return None


def _call_gemini(
    api_key: str, brand_display: str, b64: str, mime: str
) -> dict | None:
    """Single Gemini Flash call. Returns parsed JSON or None on error."""
    body = {
        "contents": [{
            "role": "user",
            "parts": [
                {"inline_data": {"mime_type": mime, "data": b64}},
                {"text": PROMPT_TEMPLATE.format(brand=brand_display)},
            ],
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 400,
            "responseMimeType": "application/json",
        },
    }
    try:
        r = httpx.post(
            f"{GEMINI_FLASH_URL}?key={api_key}",
            json=body, timeout=60.0,
        )
        if r.status_code != 200:
            log.warning("Gemini HTTP %d: %s", r.status_code, r.text[:200])
            return None
        data = r.json()
        text = (
            data.get("candidates", [{}])[0]
            .get("content", {}).get("parts", [{}])[0]
            .get("text", "")
        )
        if not text:
            return None
        return json.loads(text.strip())
    except Exception as e:
        log.warning("Gemini call failed: %s", e)
        return None


def _update_row(
    supabase_url: str, service_key: str, watch_id: str,
    new_name: str, new_reference: str | None,
) -> bool:
    """PATCH watches row. Returns True on success."""
    url = f"{supabase_url}/rest/v1/watches?id=eq.{watch_id}"
    payload = {"name": new_name}
    if new_reference:
        payload["reference"] = new_reference
    try:
        r = httpx.patch(
            url, headers={**_supabase_headers(service_key), "Prefer": "return=minimal"},
            json=payload, timeout=30.0,
        )
        if 200 <= r.status_code < 300:
            return True
        log.warning("UPDATE failed %s: HTTP %d %s", watch_id, r.status_code, r.text[:200])
        return False
    except Exception as e:
        log.warning("UPDATE exception %s: %s", watch_id, e)
        return False


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--brand", required=True,
                    help="Brand folder name (e.g. Hublot, A_Lange_Sohne)")
    ap.add_argument("--limit", type=int, default=200,
                    help="Max rows to refine in this run")
    ap.add_argument("--throttle-ms", type=int, default=500,
                    help="Sleep between Gemini calls (default 500ms)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    brand_display = BRAND_DISPLAY.get(args.brand)
    if not brand_display:
        raise SystemExit(f"brand '{args.brand}' missing from BRAND_DISPLAY")

    supabase_url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("EXPO_PUBLIC_GEMINI_API_KEY", "")

    if not supabase_url or not service_key:
        raise SystemExit("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    if not args.dry_run and not api_key:
        raise SystemExit("missing GEMINI_API_KEY")

    log.info("Fetching unrefined rows for brand=%s …", brand_display)
    rows = _fetch_unrefined_rows(supabase_url, service_key, brand_display, args.limit)
    log.info("Found %d unrefined rows (cap=%d)", len(rows), args.limit)

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    counts = {"refined": 0, "skipped_low_conf": 0, "skipped_mislabeled": 0,
              "failed": 0, "missing_image": 0}

    t0 = time.time()
    for i, row in enumerate(rows, 1):
        image_path = _disk_path_for_row(row, args.brand)
        log.info("[%d/%d] %s → %s", i, len(rows), row["id"][:80],
                 image_path.name if image_path else "(image not on disk)")

        if not image_path:
            counts["missing_image"] += 1
            continue
        if args.dry_run:
            continue

        b64_mime = _image_b64(image_path)
        if not b64_mime:
            counts["failed"] += 1
            continue
        b64, mime = b64_mime

        result = _call_gemini(api_key, brand_display, b64, mime)
        if not result:
            counts["failed"] += 1
            continue

        # Persist trace for later auditing
        with LOG_PATH.open("a") as f:
            f.write(json.dumps({
                "ts": time.time(), "watch_id": row["id"], "image": str(image_path),
                "gemini": result,
            }) + "\n")

        if not result.get("is_genuine_brand", True):
            log.info("    ✗ Gemini flagged as not-genuine — skipping update")
            counts["skipped_mislabeled"] += 1
            continue
        if (result.get("confidence") or 0) < 0.5:
            log.info("    ⚠ confidence %.2f < 0.5 — skipping update",
                     result.get("confidence") or 0)
            counts["skipped_low_conf"] += 1
            continue

        new_name = result.get("model_name", "").strip()
        new_ref = (result.get("reference") or "").strip() or None
        # Prepend brand to model_name for ResultScreen display consistency
        if new_name and not new_name.lower().startswith(brand_display.lower()):
            new_name = f"{brand_display} {new_name}"

        if not new_name:
            counts["failed"] += 1
            continue

        log.info("    ✓ → name=%r ref=%r", new_name, new_ref)
        if _update_row(supabase_url, service_key, row["id"], new_name, new_ref):
            counts["refined"] += 1
        else:
            counts["failed"] += 1

        time.sleep(args.throttle_ms / 1000.0)

    dt = time.time() - t0
    print("")
    print("═══════════════════════════════════════════")
    print(f"  Brand:             {brand_display}")
    print(f"  Rows processed:    {len(rows)}")
    print(f"  ✓ Refined:         {counts['refined']}")
    print(f"  ✓ Skipped (low conf): {counts['skipped_low_conf']}")
    print(f"  ✓ Skipped (mislabeled): {counts['skipped_mislabeled']}")
    print(f"  ✗ Failed:          {counts['failed']}")
    print(f"  ✗ Missing image:   {counts['missing_image']}")
    print(f"  Time:              {dt:.1f}s")
    print(f"  Estimated cost:    ~฿{counts['refined'] * 0.18:.2f}")
    print(f"  Trace log:         {LOG_PATH}")
    print("═══════════════════════════════════════════")


if __name__ == "__main__":
    main()
