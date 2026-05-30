"""Scrape Frédérique Constant images directly from product-sitemap.xml.

Their sitemap is a goldmine: every product entry embeds the watch image URLs
inline. We dedupe by filename and download in parallel.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

log = logging.getLogger("scrape_fc")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Referer": "https://frederiqueconstant.com/"}

_IMG = re.compile(r'https://[^<>"\s]+\.(?:jpg|jpeg|png|webp)', re.IGNORECASE)

# Skip non-watch product images.
SKIP_PATTERNS = ["pouch", "bag", "strap-only", "buckle", "boutique", "showroom", "team-"]


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


async def main(args) -> None:
    args.out_dir.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(http2=False, follow_redirects=True) as client:
        # Fetch all product sitemaps
        urls = set()
        for shard in [
            "https://frederiqueconstant.com/product-sitemap.xml",
            "https://frederiqueconstant.com/product-sitemap2.xml",
        ]:
            try:
                r = await client.get(shard, headers=HEADERS, timeout=30.0)
                if r.status_code == 200:
                    for m in _IMG.finditer(r.text):
                        url = m.group(0)
                        low = url.lower()
                        if any(s in low for s in SKIP_PATTERNS):
                            continue
                        urls.add(url)
            except Exception as exc:
                log.warning("sitemap %s failed: %s", shard, exc)
        log.info("FC: %d candidate image URLs", len(urls))
        if args.limit:
            urls = list(urls)[: args.limit]

        sem = asyncio.Semaphore(args.concurrency)
        n_ok = 0
        n_skip = 0
        async def do(url):
            nonlocal n_ok, n_skip
            fname = urlparse(url).path.rsplit("/", 1)[-1]
            out = args.out_dir / fname
            async with sem:
                if await download(client, url, out):
                    n_ok += 1
                else:
                    n_skip += 1
                if (n_ok + n_skip) % 100 == 0:
                    log.info("dl %d/%d (skip=%d)", n_ok + n_skip, len(urls), n_skip)
        await asyncio.gather(*(do(u) for u in urls))
        log.info("DONE downloaded=%d skipped=%d", n_ok, n_skip)


def cli() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out-dir", type=Path,
                   default=Path("/Users/kritsada/Desktop/Luxury Watch/official/Frederique_Constant/Watches"))
    p.add_argument("--concurrency", type=int, default=12)
    p.add_argument("--limit", type=int, default=0)
    args = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
