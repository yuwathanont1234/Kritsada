"""Class-size gap analysis for watch_embeddings.

Identifies under-represented (brand, ref) classes that limit retrieval
accuracy, and writes a human-readable Markdown report with suggested URLs
and search queries for each gap.

Usage:
    python scripts/gap_report.py --out scripts/output/gap_report.md
    python scripts/gap_report.py --threshold 10
"""
from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

log = logging.getLogger("gap_report")

# Known official-CDN brand patterns from existing README.md, useful for the
# "where to look" hint in the report.
BRAND_CDN = {
    "Rolex": ("media.rolex.com", "https://www.rolex.com/watches"),
    "Tudor": ("media.tudorwatch.com", "https://www.tudorwatch.com/watches"),
    "Seiko": ("seikowatches.com/-/media", "https://www.seikowatches.com/global-en/products"),
    "Breitling": ("saleor.cloud", "https://www.breitling.com/us-en/watches"),
    "Patek Philippe": ("patek-res.cloudinary.com", "https://www.patek.com/en/collection"),
    "Audemars Piguet": ("dynamicmedia.audemarspiguet.com", "https://www.audemarspiguet.com/com/en/home.html"),
    "Franck Muller": ("images.squarespace-cdn.com", "https://www.franckmuller.com/collections"),
    "Zenith": ("images.zenith-watches.com", "https://www.zenith-watches.com/en/watches"),
    "Omega": ("omegawatches.com/media", "https://www.omegawatches.com/watches"),
    "Longines": ("api.ecom.longines.com", "https://www.longines.com/en-us/watchmaking/our-collections"),
    "Panerai": ("panerai.com/content/dam", "https://www.panerai.com/us/en/collections"),
    "Cartier": ("cartier.com/dw/image/v2", "https://www.cartier.com/en-us/watches"),
    "TAG Heuer": ("tagheuer.com", "https://www.tagheuer.com/us/en/watches"),
    "IWC": ("iwc.com", "https://www.iwc.com/us/en/watch-collections"),
    "Jaeger-LeCoultre": ("jaeger-lecoultre.com", "https://www.jaeger-lecoultre.com/us/en/watches"),
    "A. Lange & Söhne": ("alange-soehne.com", "https://www.alange-soehne.com/en/timepieces"),
    "Hublot": ("hublot.com", "https://www.hublot.com/en-us/watches"),
    "Blancpain": ("blancpain.com", "https://www.blancpain.com/en/collections"),
    "Breguet": ("breguet.com", "https://www.breguet.com/en/watches"),
    "Bvlgari": ("bulgari.com", "https://www.bulgari.com/en-us/watches"),
    "Chopard": ("objects-prod.cdn.chopard.com", "https://www.chopard.com/en/watches"),
    "F.P. Journe": ("fpjourne.com", "https://www.fpjourne.com/en/collections"),
    "Girard-Perregaux": ("girard-perregaux.com", "https://www.girard-perregaux.com/en/collections"),
    "Greubel Forsey": ("greubelforsey.com", "https://www.greubelforsey.com/en/timepieces"),
    "Jacob & Co.": ("jacobandco.com", "https://www.jacobandco.com/collections"),
    "MB&F": ("mbandf.com", "https://www.mbandf.com/en/machines"),
    "Montblanc": ("montblanc.com", "https://www.montblanc.com/en-us/discover/specials/watches"),
    "NOMOS Glashütte": ("nomos-glashuette.com", "https://nomos-glashuette.com/en/watches"),
    "Ulysse Nardin": ("ulysse-nardin.com", "https://www.ulysse-nardin.com/en/watch-collection"),
    "URWERK": ("urwerk.com", "https://www.urwerk.com/en/timepieces"),
}


def _tier(n: int) -> str:
    if n == 1: return "1-only"
    if n <= 4: return "2-4 (very weak)"
    if n <= 9: return "5-9 (weak)"
    if n <= 19: return "10-19 (ok)"
    if n <= 49: return "20-49 (good)"
    return "50+ (excellent)"


def main(args) -> None:
    from app.db import get_conn

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            select brand, ref, count(*) as n,
                   bool_or(verified) as any_verified
            from watch_embeddings
            where embedding_version = %s and is_benchmark = true
            group by brand, ref
            order by brand, n
        """, (args.embedding_version,))
        rows = cur.fetchall()

    by_brand: dict[str, list[tuple[str, int, bool]]] = defaultdict(list)
    for brand, ref, n, ver in rows:
        by_brand[brand].append((ref, n, ver))

    out_lines: list[str] = []
    out_lines.append("# Watch Reference Dataset — Gap Report\n")
    out_lines.append(f"Generated against `embedding_version = {args.embedding_version}`.\n")
    out_lines.append("**Goal**: every `(brand, ref)` class should have ≥ "
                     f"**{args.threshold} samples** to support solid retrieval.\n")

    total_classes = sum(len(refs) for refs in by_brand.values())
    total_rows = sum(n for refs in by_brand.values() for _, n, _ in refs)
    out_lines.append(f"**Current**: {len(by_brand)} brands · {total_classes} classes · {total_rows} rows.\n")

    # Tier summary
    tier_counts: dict[str, int] = defaultdict(int)
    for refs in by_brand.values():
        for _, n, _ in refs:
            tier_counts[_tier(n)] += 1
    out_lines.append("## Class size distribution\n")
    out_lines.append("| Tier | Classes |")
    out_lines.append("|---|---:|")
    for tier in ["1-only", "2-4 (very weak)", "5-9 (weak)", "10-19 (ok)", "20-49 (good)", "50+ (excellent)"]:
        out_lines.append(f"| {tier} | {tier_counts.get(tier, 0)} |")
    out_lines.append("")

    # Critical gaps (size < threshold)
    out_lines.append(f"## Critical gaps (< {args.threshold} samples)\n")
    out_lines.append("Each row below is a class that needs more reference images.")
    out_lines.append("`target_add` is how many more samples to reach the threshold.\n")
    out_lines.append("| Brand | Ref | Current | Need | CDN host | Brand watch page |")
    out_lines.append("|---|---|---:|---:|---|---|")

    gap_count = 0
    for brand in sorted(by_brand):
        cdn_host, brand_url = BRAND_CDN.get(brand, ("?", "?"))
        for ref, n, _ in sorted(by_brand[brand], key=lambda x: x[1]):
            if n >= args.threshold:
                continue
            need = args.threshold - n
            out_lines.append(
                f"| {brand} | {ref} | {n} | +{need} | "
                f"`{cdn_host}` | [{brand_url}]({brand_url}) |"
            )
            gap_count += 1
    out_lines.append("")
    out_lines.append(f"**Total critical gaps**: {gap_count}\n")

    # Top "easy wins" — brands with many small classes where the CDN is known
    out_lines.append("## Top easy wins (brands with known CDN + many gaps)\n")
    out_lines.append("These brands already have a known CDN pattern in the README, so")
    out_lines.append("filling gaps just means listing more product URLs in `_<brand>_urls.txt`")
    out_lines.append("and running the existing downloader.\n")
    easy_wins = []
    for brand, refs in by_brand.items():
        if brand not in BRAND_CDN:
            continue
        small = [r for r in refs if r[1] < args.threshold]
        if not small:
            continue
        easy_wins.append((brand, len(small), sum(args.threshold - n for _, n, _ in small)))
    easy_wins.sort(key=lambda x: -x[2])
    out_lines.append("| Brand | Gap classes | Images needed |")
    out_lines.append("|---|---:|---:|")
    for brand, classes, total_needed in easy_wins:
        out_lines.append(f"| {brand} | {classes} | +{total_needed} |")
    out_lines.append("")

    # Search hints for the "1-only" tier
    one_only = [(b, r) for b, refs in by_brand.items() for r, n, _ in refs if n == 1]
    out_lines.append(f"## Singleton classes ({len(one_only)} — top priority)\n")
    out_lines.append("These have a single sample and can't be trained on. Each needs ")
    out_lines.append("at least 5 more images before the next probe retraining.\n")
    for b, r in sorted(one_only):
        cdn_host, brand_url = BRAND_CDN.get(b, ("?", "?"))
        query = f'"{b} {r}" watch official site'
        out_lines.append(f"### {b} / {r}")
        out_lines.append(f"- Brand site: {brand_url}")
        out_lines.append(f"- Google query: `{query}`")
        out_lines.append(f"- Chrono24 listing: https://www.chrono24.com/search/index.htm?query={b.replace(' ', '+')}+{r.replace(' ', '+')}")
        out_lines.append("")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text("\n".join(out_lines))
    log.info("wrote %s  (gaps=%d)", args.out, gap_count)
    print(f"\n=== Summary ===")
    print(f"Brands: {len(by_brand)}")
    print(f"Classes: {total_classes}")
    print(f"Rows: {total_rows}")
    print(f"Critical gaps (<{args.threshold}): {gap_count}")
    print(f"Singletons: {len(one_only)}")
    print(f"\nReport: {args.out}")


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path,
                        default=Path(__file__).resolve().parent / "output" / "gap_report.md")
    parser.add_argument("--threshold", type=int, default=10,
                        help="A class with fewer than this many samples is a 'gap'.")
    parser.add_argument("--embedding-version", default="dinov3-vitl16/probe-v3")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    main(args)


if __name__ == "__main__":
    cli()
