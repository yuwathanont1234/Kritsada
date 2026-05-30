"""Scrape Grand Seiko collection pages.

GS uses Sitecore-served pages where image paths are relative:
  /us-en/-/media/Images/GlobalEn/GrandSeiko/...png

We hit the main collections page + each sub-collection, harvest every
relative media URL, prefix with the host, dedupe and download.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, urljoin

import httpx

log = logging.getLogger("scrape_gs")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Referer": "https://www.grand-seiko.com/"}

BASE = "https://www.grand-seiko.com"

# Pages with product imagery
PAGE_URLS = [
    "https://www.grand-seiko.com/us-en/collections",
    "https://www.grand-seiko.com/us-en/collections/masterpiece",
    "https://www.grand-seiko.com/us-en/collections/heritage",
    "https://www.grand-seiko.com/us-en/collections/evolution-9",
    "https://www.grand-seiko.com/us-en/collections/sport",
    "https://www.grand-seiko.com/us-en/collections/elegance",
    # Specific model pages (a few well-known ones)
    "https://www.grand-seiko.com/us-en/special/watchesandwonders2025",
    "https://www.grand-seiko.com/us-en/special/sbgw321",
]

_MEDIA_REL = re.compile(r'(?:src|data-src)="(/us-en/-/media/[^"]+\.(?:png|jpg|jpeg|webp))"', re.IGNORECASE)
_MEDIA_ABS = re.compile(r'https://[^"\s]+grand-seiko\.com[^"\s]*\.(?:png|jpg|jpeg|webp)', re.IGNORECASE)


async def fetch(client, url):
    try:
        r = await client.get(url, headers=HEADERS, timeout=20.0)
        return r.text if r.status_code == 200 else ""
    except Exception:
        return ""


async def download(client, url, out: Path) -> bool:
    if out.exists() and out.stat().st_size > 1000:
        return False
    try:
        async with client.stream("GET", url, headers=HEADERS, timeout=60.0) as r:
            if r.status_code != 200: return False
            out.parent.mkdir(parents=True, exist_ok=True)
            with out.open("wb") as f:
                async for c in r.aiter_bytes(1 << 14):
                    f.write(c)
        return True
    except Exception:
        return False


def extract_urls(html: str) -> set[str]:
    urls = set()
    for m in _MEDIA_REL.finditer(html):
        urls.add(BASE + m.group(1).split("?")[0])
    for m in _MEDIA_ABS.finditer(html):
        urls.add(m.group(0).split("?")[0])
    return urls


def url_to_filename(url: str) -> str:
    # /us-en/-/media/Images/GlobalEn/GrandSeiko/Home/collections/X/main/SBGD201_Watch.png
    # -> SBGD201_Watch.png (or with leading dir if naming clash)
    p = urlparse(url).path
    parts = p.split("/")
    leaf = parts[-1]
    return leaf


async def main(args) -> None:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(http2=False, follow_redirects=True) as client:
        all_imgs: set[str] = set()
        for page in PAGE_URLS:
            html = await fetch(client, page)
            imgs = extract_urls(html)
            log.info("page %s -> %d images", page.split("/")[-1] or "collections", len(imgs))
            all_imgs.update(imgs)
        log.info("total unique image URLs: %d", len(all_imgs))

        if args.limit:
            all_imgs = list(all_imgs)[: args.limit]

        sem = asyncio.Semaphore(args.concurrency)
        n_ok = n_skip = 0
        async def do(url):
            nonlocal n_ok, n_skip
            fname = url_to_filename(url)
            # Skip obvious non-product UI assets
            low = fname.lower()
            if any(k in low for k in ["logo", "icon", "sprite", "favicon", "header", "footer", "social", "background", "loading", "common/"]):
                n_skip += 1
                return
            out = args.out_dir / fname
            async with sem:
                if await download(client, url, out):
                    n_ok += 1
                else:
                    n_skip += 1
        await asyncio.gather(*(do(u) for u in all_imgs))
        log.info("DONE downloaded=%d skipped=%d", n_ok, n_skip)


def cli() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out-dir", type=Path,
                   default=Path("/Users/kritsada/Desktop/Luxury Watch/official/Grand_Seiko/Watches"))
    p.add_argument("--concurrency", type=int, default=8)
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
