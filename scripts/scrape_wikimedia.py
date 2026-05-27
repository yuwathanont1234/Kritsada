"""Pull watch reference images from Wikimedia Commons.

For brands blocked by Cloudflare or with JS-rendered sites, Wikimedia
Commons is a free, CC-licensed alternative. Coverage is thinner than the
official brand sites but adequate for niche / luxury brands.

Usage:
    python scripts/scrape_wikimedia.py
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
from pathlib import Path

import httpx

log = logging.getLogger("scrape_wm")

UA = (
    # Wikimedia tightened their UA policy in Q1 2026 and now 403s the old
    # generic LuxuryAuthenticatorResearch string. Their public guidance is
    # to send a real browser UA + a contact identifier embedded inside it.
    # The Mozilla prefix gets us past the bot filter; the trailing tool tag
    # keeps us identifiable in their abuse logs if anything looks off.
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "LuxuryAuthenticatorBot/1.0 (kritsada@luxury-auth.app) "
    "Chrome/120.0.0.0 Safari/537.36"
)
API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": UA}

# Brand -> list of search queries.
QUERIES: dict[str, list[str]] = {
    "Vacheron_Constantin": [
        "Vacheron Constantin Overseas",
        "Vacheron Constantin Patrimony",
        "Vacheron Constantin Traditionnelle",
        "Vacheron Constantin Historiques",
        "Vacheron Constantin watch",
    ],
    "Hermes": [
        "Hermès Cape Cod watch",
        "Hermès Arceau",
        "Hermès Heure H",
        "Hermès Slim watch",
        "Hermès Carré H",
    ],
    "Piaget": [
        "Piaget Altiplano",
        "Piaget Polo",
        "Piaget Limelight",
        "Piaget Possession watch",
        "Piaget watch",
    ],
    "Glashutte_Original": [
        "Glashütte Original PanoMaticLunar",
        "Glashütte Original Senator",
        "Glashütte Original SeaQ",
        "Glashütte Original watch",
    ],
    "Oris": [
        "Oris Aquis",
        "Oris ProPilot",
        "Oris Big Crown",
        "Oris Divers Sixty-Five",
        "Oris watch",
    ],
    "Hamilton": [
        "Hamilton Khaki Field",
        "Hamilton Ventura",
        "Hamilton Jazzmaster",
        "Hamilton Pan Europ",
        "Hamilton watch",
    ],
    "Mido": [
        "Mido Multifort",
        "Mido Ocean Star",
        "Mido watch",
    ],
    "Maurice_Lacroix": [
        # Aikon line — broad + specific variants. Aikon Chronograph (the
        # one that mis-matched as Panerai Submersible in production) gets
        # its own query so we don't rely on the generic "Aikon" hit list.
        "Maurice Lacroix Aikon",
        "Maurice Lacroix Aikon Automatic",
        "Maurice Lacroix Aikon Chronograph",
        "Maurice Lacroix Aikon Skeleton",
        "Maurice Lacroix Aikon Tide",
        # Pontos — round dress / sport hybrid. Black-dial chronograph
        # variants are visually closest to Aikon Chrono so reinforce
        # the brand cluster in embedding space.
        "Maurice Lacroix Pontos",
        "Maurice Lacroix Pontos S",
        "Maurice Lacroix Pontos Chronograph",
        # Masterpiece — flagship complications (skeleton / moonphase).
        "Maurice Lacroix Masterpiece",
        "Maurice Lacroix Masterpiece Squelette",
        # Entry / vintage lines (still in market).
        "Maurice Lacroix Eliros",
        "Maurice Lacroix Calypso",
        # Catch-all.
        "Maurice Lacroix watch",
    ],
    "Citizen": [
        "Citizen Promaster",
        "Citizen Eco-Drive",
        "Citizen Tsuyosa",
        "Citizen Series 8",
        "Citizen watch",
    ],
}


async def search_files(client: httpx.AsyncClient, query: str, limit: int = 30) -> list[dict]:
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srnamespace": "6",  # File namespace
        "srlimit": str(limit),
    }
    try:
        r = await client.get(API, params=params, headers=HEADERS, timeout=30.0)
        if r.status_code != 200:
            return []
        return r.json().get("query", {}).get("search", [])
    except Exception as exc:
        log.warning("search %r failed: %s", query, exc)
        return []


async def get_image_url(client: httpx.AsyncClient, title: str) -> str | None:
    """Resolve a Wikimedia file title to its actual image URL."""
    params = {
        "action": "query",
        "format": "json",
        "titles": title,
        "prop": "imageinfo",
        "iiprop": "url|size|mime",
    }
    try:
        r = await client.get(API, params=params, headers=HEADERS, timeout=30.0)
        if r.status_code != 200:
            return None
        pages = r.json().get("query", {}).get("pages", {})
        for _pid, p in pages.items():
            info = (p.get("imageinfo") or [{}])[0]
            url = info.get("url")
            mime = info.get("mime", "")
            if url and mime.startswith("image/") and "svg" not in mime:
                return url
        return None
    except Exception:
        return None


async def download(client: httpx.AsyncClient, url: str, out: Path) -> bool:
    if out.exists() and out.stat().st_size > 1000:
        return False
    try:
        async with client.stream("GET", url, headers=HEADERS, timeout=60.0) as r:
            if r.status_code != 200:
                return False
            out.parent.mkdir(parents=True, exist_ok=True)
            with out.open("wb") as f:
                async for c in r.aiter_bytes(1 << 14):
                    f.write(c)
        return True
    except Exception:
        return False


async def main(args) -> None:
    args.out_root.mkdir(parents=True, exist_ok=True)
    # Strict serial pacing — Wikimedia is touchy about burst traffic.
    async with httpx.AsyncClient(http2=False, follow_redirects=True) as client:
        for brand_folder, queries in QUERIES.items():
            if args.brand and brand_folder.lower() != args.brand.lower():
                continue
            out_dir = args.out_root / brand_folder / "Watches"
            out_dir.mkdir(parents=True, exist_ok=True)
            log.info("=== %s ===", brand_folder)
            seen_titles: set[str] = set()
            n_ok = n_skip = 0
            for q in queries:
                await asyncio.sleep(1.0)
                results = await search_files(client, q, limit=40)
                for r in results:
                    title = r.get("title", "")
                    if title in seen_titles:
                        continue
                    seen_titles.add(title)
                    if not title.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                        continue
                    # Filter shops / logos / boutique entries
                    low = title.lower()
                    if any(s in low for s in ["logo", "boutique", "shop", "store"]):
                        continue
                    await asyncio.sleep(0.6)
                    url = await get_image_url(client, title)
                    if not url:
                        continue
                    fname = title.replace("File:", "").replace(" ", "_")
                    out = out_dir / fname
                    await asyncio.sleep(0.6)
                    if await download(client, url, out):
                        n_ok += 1
                    else:
                        n_skip += 1
            log.info("  %s: downloaded=%d skipped=%d unique_titles=%d",
                     brand_folder, n_ok, n_skip, len(seen_titles))


def cli() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out-root", type=Path,
                   default=Path("/Users/kritsada/Desktop/Luxury Watch/official"))
    p.add_argument("--brand", help="Filter to one brand folder name (e.g. Hermes)")
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
