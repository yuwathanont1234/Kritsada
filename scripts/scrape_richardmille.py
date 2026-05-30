"""Scrape Richard Mille product pages and download official watch images.

RM uses a WordPress media library at media.richardmille.com. Each product page
embeds dozens of images (multiple sizes + lifestyle + partner shots) as JSON.

Strategy:
  1. Pull sitemap.xml -> filter to /collections/* and /historical-models/* URLs.
  2. For each page: fetch HTML, decode the JSON-escaped \\u002F media URLs.
  3. Filter to product photos (drop GettyImages, store locator, partner shots).
  4. Keep only the largest size variant per image (drop 150x150, 300x200, etc).
  5. Download to official/Richard_Mille/Watches/.
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

log = logging.getLogger("scrape_rm")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.richardmille.com/",
}
PAGE_HEADERS = {**HEADERS, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8"}

_PRODUCT_LINE = re.compile(r"/(collections|historical-models)/(rm-[a-z0-9-]+)", re.IGNORECASE)
# JSON-encoded "/" appears for paths; also plain "/"
_ESCAPED = re.compile(r'media\.richardmille\.com(?:\\u002F|/)[\w./%\-\\u]+\.(?:jpg|jpeg|png|webp)', re.IGNORECASE)
_SIZE_SUFFIX = re.compile(r"-(\d+)x(\d+)\.(\w+)$")

# Skip these path patterns — they aren't product photos.
_SKIP_PATTERNS = [
    "gettyimages",
    "imdg",          # often lifestyle/partner press shots
    "richard-mille-france", "richard-mille-monaco", "richard-mille-bangkok",
    "richard-mille-united-arab", "richard-mille-singapore",
    "richard-mille-istanbul", "richard-mille-china", "richard-mille-canada",
    "richard-mille-italy", "richard-mille-germany", "richard-mille-japan",
    "richard-mille-tokyo", "richard-mille-malaysia", "richard-mille-the-",
    "richard-mille-pacific", "richard-mille-elements", "richard-mille-st-",
    "richard-mille-wynn", "richard-mille-mbs", "richard-mille-bal",
    "richard-mille-mandarin", "richard-mille-isetan", "richard-mille-buenos",
    "richard-mille-chicago", "richard-mille-boston", "richard-mille-dallas",
    "richard-mille-doha", "richard-mille-kuwait", "richard-mille-london",
    "richard-mille-osaka", "richard-mille-kobe", "richard-mille-shanghai",
    "richard-mille-mb", "richard-mille-aspen", "richard-mille-jakarta",
    "richard-mille-sydney", "richard-mille-vancouver", "richard-mille-seoul",
    "richard-mille-saudi", "richard-mille-paris", "richard-mille-milan",
    "richard-mille-geneva", "richard-mille-munich", "richard-mille-monte",
    "richard-mille-taipei", "richard-mille-st-barths", "richard-mille-miami",
    "richard-mille-shops", "richard-mille-beverly", "richard-mille-abu",
    "richard-mille-elements",
    "rallye", "le-mans", "watson", "nadal", "leclerc",  # athletes/events shots
    "yohan-blake", "tournament",
    "/credits/", "/storelocator/", "/events/", "/friends-",
]


def _unescape_url(s: str) -> str:
    return s.replace("\\u002F", "/").replace("%2F", "/")


def _is_product_image(url: str) -> bool:
    low = url.lower()
    return not any(p in low for p in _SKIP_PATTERNS)


def _strip_size_suffix(url: str) -> str:
    """Convert -1024x683.jpg back to .jpg so we get the full-size version."""
    m = _SIZE_SUFFIX.search(url)
    if not m:
        return url
    return _SIZE_SUFFIX.sub(f".{m.group(3)}", url)


def collect_image_urls(html: str) -> set[str]:
    raw = set()
    for m in _ESCAPED.finditer(html):
        url = "https://" + _unescape_url(m.group(0))
        raw.add(url)
    full = {_strip_size_suffix(u) for u in raw}
    return {u for u in full if _is_product_image(u)}


def get_product_urls(sitemap_text: str) -> list[str]:
    return sorted({
        ("https://www.richardmille.com" + m.group(0)).replace("http://", "https://")
        for m in _PRODUCT_LINE.finditer(sitemap_text)
    })


async def fetch_page(client: httpx.AsyncClient, url: str) -> str:
    try:
        r = await client.get(url, headers=PAGE_HEADERS, timeout=30.0)
        if r.status_code == 200:
            return r.text
        log.warning("page %d %s", r.status_code, url)
    except Exception as exc:  # noqa: BLE001
        log.warning("fetch failed %s: %s", url, exc)
    return ""


async def download(client: httpx.AsyncClient, url: str, out: Path) -> bool:
    if out.exists() and out.stat().st_size > 1000:
        return False
    try:
        async with client.stream("GET", url, headers=HEADERS, timeout=60.0) as resp:
            if resp.status_code != 200:
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
    p = urlparse(url).path
    return p.rsplit("/", 1)[-1]


async def main(args) -> None:
    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(http2=False, follow_redirects=True) as client:
        sm = (await client.get("https://www.richardmille.com/sitemap.xml",
                               headers=PAGE_HEADERS, timeout=30.0)).text
        product_urls = get_product_urls(sm)
        log.info("found %d product URLs in sitemap", len(product_urls))
        if args.limit:
            product_urls = product_urls[: args.limit]

        page_sem = asyncio.Semaphore(args.page_concurrency)
        dl_sem = asyncio.Semaphore(args.dl_concurrency)

        all_images: set[str] = set()

        async def per_product(url: str):
            async with page_sem:
                html = await fetch_page(client, url)
            imgs = collect_image_urls(html)
            all_images.update(imgs)

        await asyncio.gather(*(per_product(u) for u in product_urls))
        log.info("collected %d unique image URLs", len(all_images))

        # download
        n_dl = 0
        n_skip = 0
        async def do_download(url: str):
            nonlocal n_dl, n_skip
            fname = url_to_filename(url)
            out = out_dir / fname
            async with dl_sem:
                ok = await download(client, url, out)
            if ok: n_dl += 1
            else: n_skip += 1
            if (n_dl + n_skip) % 50 == 0:
                log.info("dl progress: downloaded=%d skipped=%d total_urls=%d",
                         n_dl, n_skip, len(all_images))

        await asyncio.gather(*(do_download(u) for u in all_images))
        log.info("DONE downloaded=%d already-existed=%d", n_dl, n_skip)


def cli() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path,
                        default=Path("/Users/kritsada/Desktop/Luxury Watch/official/Richard_Mille/Watches"))
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--page-concurrency", type=int, default=6)
    parser.add_argument("--dl-concurrency", type=int, default=12)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(main(args))


if __name__ == "__main__":
    cli()
