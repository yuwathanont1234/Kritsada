import asyncio
import csv
import httpx
import logging
from pathlib import Path
import sys
from urllib.parse import urlparse

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("scrape_gs_th")

ROOT_DIR = Path("/Users/kritsada/Desktop/Luxury Watch/GrandSeiko")
CONCURRENCY = 8
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA}

async def download_image(client: httpx.AsyncClient, sem: asyncio.Semaphore, url: str, out_path: Path) -> bool:
    if out_path.exists() and out_path.stat().st_size > 1000:
        return False
    async with sem:
        try:
            r = await client.get(url, headers=HEADERS, timeout=30.0)
            if r.status_code == 200:
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_bytes(r.content)
                return True
        except Exception as e:
            log.warning(f"Failed to download image {url}: {e}")
    return False

def clean_collection_name(categories: list) -> str:
    for cat in categories:
        name = cat.get("name", "")
        if "Collection" in name:
            col = name.replace("Collection", "").strip()
            # Replace spaces/hyphens with underscores
            col = col.replace(" ", "_").replace("-", "_")
            return col
    return "Others"

async def scrape_grand_seiko():
    log.info("Starting Grand Seiko Boutique Thailand scraping pipeline...")
    ROOT_DIR.mkdir(parents=True, exist_ok=True)

    url = "https://www.grandseikoboutiquethailand.com/wp-json/wc/store/v1/products"
    
    # We will hold all data by collection to write the CSV catalogs at the end
    collection_catalogs = {}  # collection_name -> list of (sku, name, price, permalink)
    download_tasks = []

    async with httpx.AsyncClient(follow_redirects=True) as client:
        page = 1
        sem = asyncio.Semaphore(CONCURRENCY)

        while True:
            log.info(f"Fetching page {page}...")
            try:
                r = await client.get(url, params={"per_page": 100, "page": page}, timeout=30.0)
                if r.status_code != 200:
                    break
                products = r.json()
                if not products:
                    log.info("No more products found.")
                    break
                
                log.info(f"Page {page} returned {len(products)} products.")
                
                for prod in products:
                    # Extract SKU from slug (slug is the official watch reference)
                    slug = prod.get("slug", "")
                    if not slug:
                        continue
                    sku = slug.upper()
                    
                    name = prod.get("name", "")
                    permalink = prod.get("permalink", "")
                    
                    # Extract price
                    price_data = prod.get("prices", {})
                    price_str = price_data.get("price", "0")
                    try:
                        price = int(float(price_str))
                    except:
                        price = 0
                    
                    # Extract collection category
                    categories = prod.get("categories", [])
                    collection = clean_collection_name(categories)
                    
                    # Add to catalog mapping
                    if collection not in collection_catalogs:
                        collection_catalogs[collection] = []
                    collection_catalogs[collection].append({
                        "sku": sku,
                        "name": name,
                        "price_thb": price,
                        "permalink": permalink
                    })
                    
                    # Extract product images
                    images = prod.get("images", [])
                    for idx, img in enumerate(images):
                        img_url = img.get("src", "")
                        if not img_url:
                            continue
                        # Parse original filename from URL
                        parsed = urlparse(img_url)
                        filename = Path(parsed.path).name
                        if not filename:
                            filename = f"{sku}_{idx}.jpg"
                        
                        target_name = f"{sku}__{filename}"
                        target_path = ROOT_DIR / collection / target_name
                        
                        download_tasks.append(download_image(client, sem, img_url, target_path))
                
                page += 1
            except Exception as e:
                log.error(f"Error fetching page {page}: {e}")
                break

        # Execute all image downloads concurrently
        if download_tasks:
            log.info(f"Starting concurrent download of {len(download_tasks)} watch images...")
            results = await asyncio.gather(*download_tasks)
            downloaded = sum(1 for r in results if r)
            log.info(f"Finished downloading {downloaded} new images.")
        
        # Write CSV catalogs for each collection
        log.info("Writing CSV catalogs...")
        for collection, rows in collection_catalogs.items():
            coll_dir = ROOT_DIR / collection
            coll_dir.mkdir(parents=True, exist_ok=True)
            csv_path = coll_dir / "_catalog.csv"
            
            # Read existing catalog if it exists to avoid overwriting or duplicates
            existing_rows = {}
            if csv_path.exists():
                try:
                    with csv_path.open("r", encoding="utf-8") as f:
                        reader = csv.DictReader(f)
                        for r in reader:
                            existing_rows[r["sku"]] = r
                except Exception as e:
                    log.warning(f"Could not read existing CSV at {csv_path}: {e}")
            
            # Merge new rows
            for row in rows:
                existing_rows[row["sku"]] = row
                
            # Write to CSV
            try:
                with csv_path.open("w", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=["sku", "name", "price_thb", "permalink"])
                    writer.writeheader()
                    # Sort rows by SKU for clean ordering
                    for sku in sorted(existing_rows.keys()):
                        writer.writerow(existing_rows[sku])
                log.info(f"Saved {len(existing_rows)} catalog entries to {csv_path}")
            except Exception as e:
                log.error(f"Failed to write CSV catalog at {csv_path}: {e}")

    log.info("Grand Seiko Boutique Thailand scraping pipeline completed successfully!")

if __name__ == "__main__":
    asyncio.run(scrape_grand_seiko())
