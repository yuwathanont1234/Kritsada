"""Apify-powered brand scraper for the 15 brands lacking native scrapers.

═══════════════════════════════════════════════════════════════════════════
WHY: scripts/scrape_chrono24.py works for individual brand CDN scraping but
fails on Chrono24's secondary-market catalog (Cloudflare bot detection +
JS-rendered grids). The 15 brands in app SettingsScreen.tsx that are still
missing from `image_embeddings` — A. Lange & Söhne, F.P. Journe, JLC,
Hublot, Breitling, Zenith, Bvlgari, Franck Muller, Girard-Perregaux, MB&F,
URWERK, Bovet, Ulysse Nardin, Parmigiani Fleurier, Longines, Seiko — sit
behind sites we don't have time to bypass individually.

We use Apify's `hooli/google-images-scraper` actor (~$1.90 per 1K images,
4.4★ as of late 2025). Google Images returns thumbnails to anyone — no
auth wall, no IP blocking — so it works reliably where Chrono24-targeted
actors fail. Output includes `imageUrl` (full-res), `imageWidth/Height`
(for filtering), and `origin` (host) per item.

HISTORY: Originally pointed at `ahmed_jasarevic/chrono24-scraper` but
that actor returned 0 pages (Chrono24 anti-bot 403'd Apify's IPs) and
hardcoded "rolex" instead of honouring the query parameter. Swapped to
`hooli/google-images-scraper` on 2026-05-27.

═══════════════════════════════════════════════════════════════════════════
PIPELINE INTEGRATION:

  Apify Actor (cloud) → JSON results (image URLs + metadata)
                      ↓
  scrape_apify.py (this script) → download images to local disk
                      ↓
  /Users/kritsada/Desktop/Luxury Watch/official/<Brand>/Watches/*.jpg
                      ↓
  scripts/index_to_image_embeddings.py (existing) → DINOv3 vectors → DB

We DON'T pipe URLs straight into the embed Edge Function because the
existing indexer reads from disk + applies probe-v4 projection + handles
idempotency. Keeping the disk-staging step preserves the proven pipeline.

═══════════════════════════════════════════════════════════════════════════
USAGE:

  # Dry-run: list what would be fetched, do not call Apify or download
  python scripts/scrape_apify.py --brand "Hublot" --limit 5 --dry-run

  # Small smoke test: 10 items total across all queries (~฿0.65)
  python scripts/scrape_apify.py --brand "Hublot" --limit 10

  # Production batch: 100 items total per brand (~฿6.50/brand)
  python scripts/scrape_apify.py --brand "Hublot" --limit 100

  # All 15 brands sequentially (overnight, ~฿100 total):
  for b in "A. Lange & Söhne" "F.P. Journe" "Jaeger-LeCoultre" \\
           "Hublot" "Breitling" "Zenith" "Bvlgari" "Franck Muller" \\
           "Girard-Perregaux" "MB&F" "URWERK" "Bovet" \\
           "Ulysse Nardin" "Parmigiani Fleurier" "Longines" "Seiko"; do
    python scripts/scrape_apify.py --brand "$b" --limit 100
  done

═══════════════════════════════════════════════════════════════════════════
ENV REQUIREMENT:

  APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxx

  Get token: https://console.apify.com/settings/integrations
  Free tier: $5 credit ≈ 2,000 items, enough to seed all 15 brands twice.

═══════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

# Late import so the script can fail with a friendlier error if missing.
try:
    from apify_client import ApifyClient
except ImportError:
    print(
        "❌ apify-client not installed. Run:  pip install apify-client",
        file=sys.stderr,
    )
    sys.exit(1)

# Load .env so APIFY_API_TOKEN populates os.environ without manual export.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional — env vars can still be set in the shell

log = logging.getLogger("scrape_apify")

# ─── Constants ──────────────────────────────────────────────────────
# Switched 2026-05-27 from `ahmed_jasarevic/chrono24-scraper` after that
# actor returned 0 pages (Chrono24 anti-bot 403'd every request) and
# hardcoded "rolex" instead of honouring our query.
#
# `hooli/google-images-scraper` was Apify Store's most reliable image
# source as of the swap (4.4★ / 12 reviews, $1.90 per 1K images,
# updated ~Nov 2025). Google Images returns thumbnails to anyone, no
# auth wall, no IP block. Per-item output includes `imageUrl` (direct
# full-resolution URL) plus useful filtering metadata: imageWidth,
# imageHeight, origin (source host), contentUrl (provenance).
DEFAULT_ACTOR = "hooli/google-images-scraper"
DEFAULT_OUT_ROOT = Path("/Users/kritsada/Desktop/Luxury Watch/official")

# Minimum image dimensions to keep — below this is usually a thumbnail
# or banner, not a useful reference photo for DINOv3 embeddings.
MIN_IMAGE_WIDTH = 500
MIN_IMAGE_HEIGHT = 500

# Per-brand query expansion. Google Images returns much better coverage
# when you query specific model names instead of just brand. Mirror the
# scrape_wikimedia.py QUERIES dict so the two sources index comparable
# reference sets. Brands fall back to a single bare-brand query when
# not enumerated here.
BRAND_QUERIES: dict[str, list[str]] = {
    "A. Lange & Söhne": [
        "A. Lange Söhne Lange 1",
        "A. Lange Söhne Datograph",
        "A. Lange Söhne Saxonia",
        "A. Lange Söhne Odysseus",
        "A. Lange Söhne 1815",
        "A. Lange Söhne Zeitwerk",
    ],
    "F.P. Journe": [
        "F.P. Journe Chronomètre",
        "F.P. Journe Octa",
        "F.P. Journe Élégante",
        "F.P. Journe Resonance",
        "F.P. Journe Tourbillon",
    ],
    "Jaeger-LeCoultre": [
        "Jaeger-LeCoultre Reverso",
        "Jaeger-LeCoultre Master Ultra Thin",
        "Jaeger-LeCoultre Polaris",
        "Jaeger-LeCoultre Master Control",
        "Jaeger-LeCoultre Rendez-Vous",
        "Jaeger-LeCoultre Atmos",
    ],
    "Hublot": [
        "Hublot Big Bang",
        "Hublot Classic Fusion",
        "Hublot Spirit of Big Bang",
        "Hublot MP Collection",
        "Hublot Square Bang",
    ],
    "Breitling": [
        "Breitling Navitimer",
        "Breitling Superocean",
        "Breitling Avenger",
        "Breitling Premier",
        "Breitling Chronomat",
        "Breitling Top Time",
    ],
    "Zenith": [
        "Zenith El Primero",
        "Zenith Chronomaster",
        "Zenith Defy",
        "Zenith Pilot",
        "Zenith Elite",
    ],
    "Bvlgari": [
        "Bvlgari Octo Finissimo",
        "Bvlgari Serpenti",
        "Bvlgari Diagono",
        "Bvlgari Bvlgari watch",
        "Bvlgari Aluminium watch",
        "Bvlgari Lvcea",
    ],
    "Franck Muller": [
        "Franck Muller Cintrée Curvex",
        "Franck Muller Vanguard",
        "Franck Muller Crazy Hours",
        "Franck Muller Long Island",
        "Franck Muller Casablanca",
    ],
    "Girard-Perregaux": [
        "Girard-Perregaux Laureato",
        "Girard-Perregaux 1966",
        "Girard-Perregaux Cat's Eye",
        "Girard-Perregaux Three Bridges",
    ],
    "MB&F": [
        "MB&F Horological Machine",
        "MB&F Legacy Machine",
        "MB&F HM10",
        "MB&F HMX",
        "MB&F LMX",
    ],
    "URWERK": [
        "URWERK UR-100",
        "URWERK UR-110",
        "URWERK UR-220",
        "URWERK satellite watch",
    ],
    "Bovet": [
        "Bovet Récital",
        "Bovet Amadeo Fleurier",
        "Bovet Virtuoso",
    ],
    "Ulysse Nardin": [
        "Ulysse Nardin Marine",
        "Ulysse Nardin Diver",
        "Ulysse Nardin Freak",
        "Ulysse Nardin Executive",
        "Ulysse Nardin Blast",
    ],
    "Parmigiani Fleurier": [
        "Parmigiani Fleurier Tonda",
        "Parmigiani Fleurier Tonda PF",
        "Parmigiani Fleurier Kalpa",
        "Parmigiani Fleurier Toric",
    ],
    "Longines": [
        "Longines Master Collection",
        "Longines HydroConquest",
        "Longines Spirit",
        "Longines Conquest",
        "Longines Heritage",
        "Longines Legend Diver",
        "Longines DolceVita",
    ],
    "Seiko": [
        "Seiko Prospex",
        "Seiko Presage",
        "Seiko Presage Cocktail",
        "Seiko 5 Sports",
        "Seiko Astron",
        "Seiko Turtle SRP",
        "Seiko Samurai",
    ],
}

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": UA}

# Minimum filesize gate — matches existing scrapers' 1000-byte threshold.
# Filters away placeholder pixels and broken-image stubs from Chrono24.
MIN_BYTES = 1000

# Filename keywords that suggest non-product shots (people, lifestyle,
# packaging). We skip these — DINOv3 trained on wrist shots / boxes adds
# noise to the embedding space.
SKIP_PATTERNS = re.compile(
    r"(wrist|lifestyle|model-|on-arm|box|warranty|"
    r"showroom|certificate|paperwork|dealer-photo)",
    re.IGNORECASE,
)


def brand_to_folder(brand: str) -> str:
    """Convert brand display name to filesystem folder name.

    Matches existing scrape_wikimedia.py QUERIES dict keys:
      "A. Lange & Söhne"     → "A_Lange_Sohne"
      "F.P. Journe"          → "FP_Journe"
      "Jaeger-LeCoultre"     → "Jaeger_LeCoultre"
      "MB&F"                 → "MB_F"
      "Girard-Perregaux"     → "Girard_Perregaux"

    Rules:
      • Drop punctuation entirely (no "and" substitution for &)
      • Replace whitespace / hyphens with single underscore
      • Strip accents (Söhne → Sohne) so DB lookups are ASCII-safe
    """
    import unicodedata
    # First strip accents — handles "Söhne" before regex sees non-ASCII bytes
    s = unicodedata.normalize("NFKD", brand).encode("ASCII", "ignore").decode()
    # `&` must become a SEPARATOR (not a deletion) so "MB&F" → "MB_F",
    # matching scrape_wikimedia.py's QUERIES key convention.
    s = s.replace("&", " ")
    # Drop other punctuation entirely: "." (F.P. → FP), "'", ",", etc.
    s = re.sub(r"[^\w\s\-]", "", s)
    # Collapse runs of whitespace, hyphens, and underscores into one underscore
    s = re.sub(r"[\s\-_]+", "_", s.strip())
    # Trim any leading/trailing underscores that survived
    return s.strip("_")


def _is_valid_image(path: Path) -> bool:
    """Verify downloaded file is a parseable image (not an HTML error page
    or partial download). Cheap — just opens header bytes, doesn't load
    full pixel data. Returns False if Pillow can't identify the format
    or the image is suspiciously tiny in pixel dimensions.
    """
    try:
        from PIL import Image
        with Image.open(path) as img:
            img.verify()  # parses header + structure, doesn't decode
        # Re-open for size check (verify() closes the file)
        with Image.open(path) as img:
            w, h = img.size
            # Hard floor: anything under 150px on either side is almost
            # certainly a favicon, button sprite, or layout chrome.
            if w < 150 or h < 150:
                return False
        return True
    except ImportError:
        # Pillow not installed → trust the file (degraded mode)
        return True
    except Exception:
        return False


async def _attempt_download(
    client: httpx.AsyncClient,
    url: str,
    out: Path,
    referer: str | None,
) -> tuple[bool, int]:
    """Single download attempt. Returns (success, status_code).

    status_code values:
      200  → success (file written, validated)
      403  → blocked (hotlink protection)
      -1   → file too small (<MIN_BYTES)
      -2   → file failed image validation (corrupt / HTML error page)
      0    → transport exception (DNS, TLS, timeout)
      other → server returned non-200 (404, 5xx, etc.)
    """
    headers = dict(HEADERS)
    if referer:
        headers["Referer"] = referer
    try:
        async with client.stream(
            "GET", url, headers=headers, timeout=30.0,
            follow_redirects=True,
        ) as r:
            if r.status_code != 200:
                return False, r.status_code
            tmp = out.with_suffix(out.suffix + ".part")
            tmp.parent.mkdir(parents=True, exist_ok=True)
            with tmp.open("wb") as f:
                async for chunk in r.aiter_bytes(1 << 14):
                    f.write(chunk)
            if tmp.stat().st_size <= MIN_BYTES:
                tmp.unlink(missing_ok=True)
                return False, -1  # too small
            # Validate it's actually a parseable image — catches the case
            # where a server returns 200 with an HTML error page body
            # (some CDNs do this for hotlink-blocked requests instead of
            # a proper 403). Also catches partial / truncated downloads.
            if not _is_valid_image(tmp):
                tmp.unlink(missing_ok=True)
                return False, -2  # not a real image
            tmp.rename(out)
            return True, 200
    except Exception as e:
        log.debug("download exception for %s: %s", url, e)
        return False, 0


async def download_with_fallback(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    candidates: list[dict],
    out_dir: Path,
    counters: dict[str, int],
) -> None:
    """Download an item's image, trying each candidate URL in order.

    Strategy: prefer `tag=full` (source-host, hi-res); on 403/non-200,
    fall back to `tag=thumb` (Google CDN, always works but smaller).
    Each item produces at most ONE file on disk.

    Idempotent: filename hashes the FIRST candidate URL so re-runs skip
    items that have already been pulled (regardless of which candidate
    eventually succeeded).
    """
    if not candidates:
        return

    # Filter lifestyle/wrist patterns out of EVERY candidate URL up front.
    candidates = [c for c in candidates if not SKIP_PATTERNS.search(c["url"])]
    if not candidates:
        counters["skipped_filter"] += 1
        return

    # Stable filename derived from the PRIMARY (first) candidate URL so
    # re-runs of the same Apify dataset are idempotent.
    primary_url = candidates[0]["url"]
    digest = hashlib.sha1(primary_url.encode("utf-8")).hexdigest()[:16]
    ext = Path(urlparse(primary_url).path).suffix.lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    out = out_dir / f"c24apify__{digest}{ext}"

    if out.exists() and out.stat().st_size > MIN_BYTES:
        counters["skipped_existing"] += 1
        return

    async with sem:
        last_status = 0
        for cand in candidates:
            ok, status = await _attempt_download(
                client, cand["url"], out, cand.get("referer"),
            )
            if ok:
                # Track which tier saved us — informative in summary
                counters[f"downloaded_{cand['tag']}"] = counters.get(
                    f"downloaded_{cand['tag']}", 0
                ) + 1
                counters["downloaded"] += 1
                return
            last_status = status

        # All candidates exhausted — bucket by last seen status
        if last_status == 403:
            counters["failed_http_403"] += 1
        elif last_status == 0:
            counters["failed_exception"] += 1
        elif last_status == -1:
            counters["failed_tiny"] += 1
        elif last_status == -2:
            counters["failed_invalid_image"] += 1
        else:
            counters["failed_http"] += 1


def extract_image_candidates(item: dict) -> list[dict]:
    """Pull download candidates from one hooli/google-images-scraper item.

    Item shape:
      {
        "imageUrl":     "https://hublot.com/.../big-bang.png",  ← often 403
        "thumbnailUrl": "https://encrypted-tbn0.gstatic.com/...", ← Google CDN, no block
        "contentUrl":   "https://source-page.com/...",
        "origin":       "hublot.com",
        "imageWidth":   1920,
        "imageHeight":  1080,
        "title":        "Hublot Big Bang Unico — Monochrome Watches"
      }

    Why a candidate LIST (not single URL):
      Many brand CDNs (hublot.com, rolex.com, ap.com etc.) block hotlinking
      via Referer check, returning 403 to direct GET. The `thumbnailUrl`
      always works because it sits on Google's gstatic CDN with no
      hotlink protection. So we return BOTH:
          [
            {"url": <imageUrl>,    "referer": <contentUrl>,  "tag": "full"},
            {"url": <thumbnailUrl>,"referer": None,          "tag": "thumb"},
          ]
      `download_image` tries each in order and saves the first that
      succeeds. Thumbnails are 200-400px (below MIN_IMAGE_WIDTH) but
      DINOv3 will still produce a usable embedding — better than 0 data.

    Filters:
      • Resolution gate at imageWidth/imageHeight — drops banner ads,
        favicons, line-drawings that slipped past Google's imageType.
      • Origin-host gate via SKIP_PATTERNS (filename keywords) happens
        later inside download_image so it applies to each candidate URL.

    Returns a list of `{url, referer, tag}` dicts (1-2 per item).
    """
    # Resolution gate — Google's imageType=photo filter still leaks small
    # marketing thumbnails; require ≥500px on both dimensions for FULL
    # candidate. (Thumb candidate gets through regardless — it's a fallback.)
    w = item.get("imageWidth") or 0
    h = item.get("imageHeight") or 0
    full_url = item.get("imageUrl")
    thumb_url = item.get("thumbnailUrl")
    content_url = item.get("contentUrl") or item.get("contentLink")

    candidates: list[dict] = []
    # Candidate 1: full-res from source host. Send Referer matching the
    # source PAGE (not the image domain) — that's what a real browser does
    # when an embedded <img> loads, and most hotlink-protection schemes
    # accept any referer from the same root domain.
    if isinstance(full_url, str) and full_url.startswith("http"):
        if not w or not h or (w >= MIN_IMAGE_WIDTH and h >= MIN_IMAGE_HEIGHT):
            candidates.append({
                "url": full_url,
                "referer": content_url if isinstance(content_url, str) else None,
                "tag": "full",
            })

    # Candidate 2: Google CDN thumbnail. Always-available fallback. Lower
    # resolution but DINOv3 still produces a usable 1024d embedding.
    if isinstance(thumb_url, str) and thumb_url.startswith("http"):
        candidates.append({
            "url": thumb_url,
            "referer": None,
            "tag": "thumb",
        })

    return candidates


async def scrape_brand(args, apify: ApifyClient) -> dict[str, int]:
    """End-to-end scrape for ONE brand. Returns counters dict."""
    counters = {
        "downloaded": 0,
        "downloaded_full": 0,    # source-host URL succeeded
        "downloaded_thumb": 0,   # Google CDN fallback used
        "skipped_existing": 0,
        "skipped_filter": 0,
        "failed_http": 0,
        "failed_http_403": 0,    # explicit hotlink-block count
        "failed_tiny": 0,
        "failed_invalid_image": 0,  # HTML error page or corrupt download
        "failed_exception": 0,
        "items_returned": 0,
        "image_urls_seen": 0,
    }

    # ── Step 1: Build query list + run Apify Actor ──
    # hooli/google-images-scraper expects `queries` as an ARRAY of search
    # terms. Use BRAND_QUERIES expansion if defined — multiple specific
    # model queries return much better visual coverage than one bare brand
    # query (e.g. "Hublot Big Bang" + "Hublot Classic Fusion" beats just
    # "Hublot" which biases toward homepage hero shots).
    queries = BRAND_QUERIES.get(args.brand, [args.brand])
    if args.thailand_filter:
        queries = [f"{q} Thailand" for q in queries]

    # Per-query item cap. The script's --limit is the TOTAL budget; we
    # divide it across the query list so cost is predictable.
    per_query = max(1, args.limit // len(queries))
    log.info(
        "⚙  Running Apify actor=%s for brand=%r → %d queries × %d items each (total cap=%d)",
        args.actor, args.brand, len(queries), per_query, args.limit
    )
    for q in queries:
        log.info("    query: %r", q)

    run_input = {
        "queries": queries,
        "maxResultsPerQuery": per_query,
        # hooli-specific knobs (others are ignored harmlessly):
        "safeSearch": "off",       # we'll filter ourselves
        "imageType": "photo",       # exclude clipart / line drawings
        "saveHtml": False,
    }

    if args.dry_run:
        log.info("🛠  DRY RUN — would call Apify with input=%s", run_input)
        log.info("    would download to %s", brand_dir(args))
        return counters

    run = apify.actor(args.actor).call(run_input=run_input)

    # apify-client v2.22+ returns a Pydantic `Run` object, not a dict.
    # Older versions returned a plain dict. Support both shapes so the
    # script works across SDK versions without forcing a pin.
    if hasattr(run, "model_dump"):
        run_dict = run.model_dump()
    elif hasattr(run, "_asdict"):
        run_dict = run._asdict()
    elif isinstance(run, dict):
        run_dict = run
    else:
        # Last resort: introspect the object directly via getattr
        run_dict = {
            "defaultDatasetId": getattr(run, "default_dataset_id", None)
                                or getattr(run, "defaultDatasetId", None),
            "id": getattr(run, "id", None),
            "status": getattr(run, "status", None),
        }

    # Try both camelCase (older SDK) and snake_case (Pydantic v2) keys.
    dataset_id = (
        run_dict.get("defaultDatasetId")
        or run_dict.get("default_dataset_id")
    )
    if not dataset_id:
        log.error("❌ Apify run finished but no dataset id returned. Keys: %s",
                  list(run_dict.keys()) if isinstance(run_dict, dict) else type(run))
        return counters
    log.info("✓ Apify run done. Dataset: %s (status=%s)",
             dataset_id, run_dict.get("status", "?"))

    # ── Step 2: Collect image URLs from result JSON ──
    items = list(apify.dataset(dataset_id).iterate_items())
    counters["items_returned"] = len(items)
    log.info("✓ Apify returned %d items", len(items))

    # Group candidates per source item — each item produces a [full, thumb]
    # fallback chain handled by download_with_fallback.
    all_candidates: list[list[dict]] = []
    for item in items:
        cands = extract_image_candidates(item)
        if cands:
            all_candidates.append(cands)
    counters["image_urls_seen"] = sum(len(g) for g in all_candidates)
    log.info(
        "→ Items with usable candidates: %d (total URL options: %d)",
        len(all_candidates), counters["image_urls_seen"]
    )

    if not all_candidates:
        log.warning("⚠️  No usable image candidates found. Actor output shape may have changed.")
        log.warning("    Sample item: %s", items[0] if items else "(no items)")
        return counters

    # ── Step 3: Download to local disk with full→thumb fallback ──
    out_dir = brand_dir(args)
    out_dir.mkdir(parents=True, exist_ok=True)
    log.info("⬇  Downloading %d items → %s", len(all_candidates), out_dir)

    sem = asyncio.Semaphore(8)  # match existing scrapers' concurrency
    async with httpx.AsyncClient() as http:
        await asyncio.gather(*(
            download_with_fallback(http, sem, cands, out_dir, counters)
            for cands in all_candidates
        ))
    return counters


def brand_dir(args) -> Path:
    return args.out_root / brand_to_folder(args.brand) / "Watches"


# ─── CLI ───────────────────────────────────────────────────────────
def cli() -> None:
    p = argparse.ArgumentParser(
        description="Apify-powered watch image scraper for the 15 missing brands."
    )
    p.add_argument(
        "--brand", required=True,
        help='Brand to scrape, e.g. "Hublot" or "A. Lange & Söhne"'
    )
    p.add_argument(
        "--limit", type=int, default=50,
        help="Max items to fetch from Apify (default: 50; ~$2.50 per 1K)"
    )
    p.add_argument(
        "--actor", default=DEFAULT_ACTOR,
        help=f"Apify actor ID (default: {DEFAULT_ACTOR})"
    )
    p.add_argument(
        "--out-root", type=Path, default=DEFAULT_OUT_ROOT,
        help=f"Base output dir (default: {DEFAULT_OUT_ROOT})"
    )
    p.add_argument(
        "--thailand-filter", action="store_true",
        help='Append "Thailand" to query — focuses on listings sold in TH market'
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="Don't call Apify or download — print what would happen"
    )

    args = p.parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    token = os.environ.get("APIFY_API_TOKEN", "").strip()
    if not args.dry_run and not token:
        print(
            "❌ APIFY_API_TOKEN not set.\n"
            "   1) Sign up at https://apify.com (Free tier = $5 credit)\n"
            "   2) Create token at https://console.apify.com/settings/integrations\n"
            "   3) Add to .env:  APIFY_API_TOKEN=apify_api_...\n",
            file=sys.stderr,
        )
        sys.exit(1)

    apify = ApifyClient(token) if token else None

    counters = asyncio.run(scrape_brand(args, apify))

    # ── Summary ──
    print("")
    print("═══════════════════════════════════════════")
    print(f"  Brand:           {args.brand}")
    print(f"  Folder:          {brand_dir(args)}")
    print(f"  Items returned:  {counters['items_returned']}")
    print(f"  URL candidates:  {counters['image_urls_seen']}")
    print(f"  ✓ Downloaded total:   {counters['downloaded']}")
    print(f"      • full-res (source): {counters.get('downloaded_full', 0)}")
    print(f"      • thumb (Google CDN fallback): {counters.get('downloaded_thumb', 0)}")
    print(f"  ✓ Skipped (existing): {counters['skipped_existing']}")
    print(f"  ✓ Skipped (lifestyle filter): {counters['skipped_filter']}")
    print(f"  ✗ HTTP failed (other): {counters['failed_http']}")
    print(f"  ✗ HTTP 403 (hotlink blocked, no fallback worked): {counters.get('failed_http_403', 0)}")
    print(f"  ✗ Tiny/corrupt:  {counters['failed_tiny']}")
    print(f"  ✗ Exceptions:    {counters['failed_exception']}")
    print("═══════════════════════════════════════════")
    print("")
    if counters["downloaded"] > 0:
        print(f"  Next step: index these into image_embeddings:")
        print(
            f"    python scripts/index_to_image_embeddings.py "
            f"--brand {brand_to_folder(args.brand)}"
        )
        print("")


if __name__ == "__main__":
    cli()
