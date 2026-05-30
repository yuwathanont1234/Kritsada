"""Scrape Tissot product pages and download official images.

Tissot uses the same Demandware CDN pattern as Cartier. Each product page
(/<locale>/<TXXXXXXXX>.html) embeds 3 product images: ZOOM, regular, shadow.

Workflow:
  1. Load T-codes from /tmp/tissot_all_models.txt (pre-extracted from sitemap).
  2. For each model: fetch product page (en-au), parse Demandware URLs.
  3. Download images to official/Tissot/Watches/.

Idempotent: skips files already on disk.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import re
import sys
from pathlib import Path

import httpx

log = logging.getLogger("scrape_tissot")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.tissotwatches.com/",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "same-origin",
}
PAGE_HEADERS = {**HEADERS, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8"}

_DW_URL = re.compile(r'https://www\.tissotwatches\.com/dw/image/v2/BKKD_PRD/on/demandware\.static/[^"?\s]+\.(?:png|jpg|jpeg|webp)', re.IGNORECASE)


async def fetch_product_urls(client: httpx.AsyncClient, model: str) -> list[str]:
    url = f"https://www.tissotwatches.com/en-au/{model}.html"
    try:
        r = await client.get(url, headers=PAGE_HEADERS, timeout=20.0)
        if r.status_code != 200:
            return []
        return sorted(set(_DW_URL.findall(r.text)))
    except Exception as exc:  # noqa: BLE001
        log.warning("page fetch %s failed: %s", model, exc)
        return []


async def download(client: httpx.AsyncClient, url: str, out: Path) -> bool:
    if out.exists() and out.stat().st_size > 1000:
        return False  # skip
    try:
        async with client.stream("GET", url, headers=HEADERS, timeout=60.0) as resp:
            if resp.status_code != 200:
                log.warning("dl %s -> %d", url[-60:], resp.status_code)
                return False
            out.parent.mkdir(parents=True, exist_ok=True)
            with out.open("wb") as f:
                async for chunk in resp.aiter_bytes(1 << 14):
                    f.write(chunk)
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("dl error %s: %s", url[-60:], exc)
        return False


def url_to_filename(url: str) -> str:
    # Use the file's tail (after last '/') with size suffix for uniqueness.
    leaf = url.rsplit("/", 1)[-1]
    return leaf


async def main(args) -> None:
    models = [m.strip() for m in args.models_file.read_text().splitlines() if m.strip()]
    if args.limit:
        models = models[: args.limit]
    log.info("scraping %d Tissot models", len(models))

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    page_sem = asyncio.Semaphore(args.page_concurrency)
    dl_sem = asyncio.Semaphore(args.dl_concurrency)
    n_urls = 0
    n_dl = 0
    n_skipped = 0

    async with httpx.AsyncClient(http2=False, follow_redirects=True) as client:
        async def per_model(model: str):
            nonlocal n_urls, n_dl, n_skipped
            async with page_sem:
                urls = await fetch_product_urls(client, model)
            n_urls += len(urls)
            for url in urls:
                fname = url_to_filename(url)
                if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    continue
                # Stamp the model code into the filename so we know which
                # product each image came from.
                stamped = f"{model}__{fname}"
                out = out_dir / stamped
                async with dl_sem:
                    inserted = await download(client, url, out)
                if inserted:
                    n_dl += 1
                else:
                    n_skipped += 1
                if (n_dl + n_skipped) % 50 == 0:
                    log.info("progress: downloaded=%d skipped=%d urls_seen=%d",
                             n_dl, n_skipped, n_urls)

        await asyncio.gather(*(per_model(m) for m in models))

    log.info("DONE downloaded=%d skipped(already-on-disk)=%d urls_seen=%d",
             n_dl, n_skipped, n_urls)


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models-file", type=Path,
                        default=Path("/tmp/tissot_models_real.txt"))
    parser.add_argument("--out-dir", type=Path,
                        default=Path("/Users/kritsada/Desktop/Luxury Watch/official/Tissot/Watches"))
    parser.add_argument("--page-concurrency", type=int, default=6)
    parser.add_argument("--dl-concurrency", type=int, default=12)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
