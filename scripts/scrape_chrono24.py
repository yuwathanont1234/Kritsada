"""Chrono24 catalog scraper via claude-in-chrome MCP fallback.

Chrono24 is a *secondary market* — most listings are genuine but a small
percentage may be misattributed. We treat these images as `confidence=0.7`
(vs 1.0 for official brand CDN), and `source_url` is tagged `chrono24://...`
so they can be filtered or down-weighted in retrieval if needed.

This script is the OFFLINE downloader. The Chrome MCP step (collecting URLs
from rendered pages) is done interactively; URLs are saved to
scripts/output/chrono24_<brand>_urls.txt then this script downloads them.

Usage:
    python scripts/scrape_chrono24.py --brand Piaget --urls scripts/output/chrono24_piaget_urls.txt
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

log = logging.getLogger("scrape_c24")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Referer": "https://www.chrono24.com/"}


async def download(client, url: str, out: Path) -> bool:
    if out.exists() and out.stat().st_size > 1000:
        return False
    try:
        async with client.stream("GET", url, headers=HEADERS, timeout=30.0) as r:
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
    urls = [line.strip() for line in args.urls.read_text().splitlines() if line.strip() and not line.startswith("#")]
    log.info("URLs: %d", len(urls))
    args.out_dir.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(args.concurrency)
    n_ok = n_skip = 0
    async with httpx.AsyncClient(http2=False, follow_redirects=True) as client:
        async def do(url):
            nonlocal n_ok, n_skip
            fname = urlparse(url).path.rsplit("/", 1)[-1]
            # Prefix the file so we know it's from Chrono24
            stamped = f"c24__{fname}"
            out = args.out_dir / stamped
            async with sem:
                if await download(client, url, out):
                    n_ok += 1
                else:
                    n_skip += 1
        await asyncio.gather(*(do(u) for u in urls))
    log.info("DONE downloaded=%d skipped=%d", n_ok, n_skip)


def cli() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--urls", type=Path, required=True)
    p.add_argument("--out-dir", type=Path, required=True)
    p.add_argument("--concurrency", type=int, default=10)
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
