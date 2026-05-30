import asyncio
import csv
import logging
import sys
from pathlib import Path
import httpx

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("scrape_tag_th")

ROOT_DIR = Path("/Users/kritsada/Desktop/Luxury Watch/TagHeuer")
CONCURRENCY = 8
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA}

# Clean collection mapping
COLLECTION_MAP = {
    "TAG_Heuer_Carrera": "Carrera",
    "TAG_Heuer_Aquaracer": "Aquaracer",
    "TAG_Heuer_Formula_1": "Formula_1",
    "TAG_Heuer_Monaco": "Monaco",
    "TAG_Heuer_Link": "Link",
    "Others": "Others"
}

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
            else:
                log.warning(f"Failed status {r.status_code} for image {url}")
        except Exception as e:
            log.warning(f"Failed to download image {url}: {e}")
    return False

def clean_collection_name(image_path: str) -> str:
    # Example: "TAG_Heuer_Carrera/WDA2112.BA0043/..."
    if not image_path:
        return "Others"
    parts = image_path.split("/")
    if not parts:
        return "Others"
    folder = parts[0]
    return COLLECTION_MAP.get(folder, "Others")

async def scrape_tagheuer():
    log.info("Starting TAG Heuer Thailand scraping pipeline...")
    ROOT_DIR.mkdir(parents=True, exist_ok=True)

    app_id = "6OBGA4VJKI"
    api_key = "8cf40864df513111d39148923f754024"
    url = f"https://{app_id}-dsn.algolia.net/1/indexes/products/query"
    
    headers = {
        "X-Algolia-Application-Id": app_id,
        "X-Algolia-API-Key": api_key,
        "Content-Type": "application/json"
    }

    collection_catalogs = {}
    download_tasks = []
    
    # We will query all records from Algolia products index page by page
    # Filter only searchable_TAG_INT = true products that have images and prices in THB
    
    async with httpx.AsyncClient(follow_redirects=True) as client:
        page = 0
        sem = asyncio.Semaphore(CONCURRENCY)
        total_scraped = 0
        
        while True:
            log.info(f"Fetching page {page} from Algolia query API...")
            req_data = {
                "params": f"query=&filters=searchable_TAG_INT:true&hitsPerPage=250&page={page}"
            }
                
            try:
                r = await client.post(url, headers=headers, json=req_data, timeout=30.0)
                if r.status_code != 200:
                    log.error(f"Algolia returned status {r.status_code}: {r.text}")
                    break
                    
                res = r.json()
                hits = res.get("hits", [])
                if not hits:
                    log.info("No more hits returned.")
                    break
                    
                log.info(f"Page {page} returned {len(hits)} hits.")
                
                for hit in hits:
                    sku = hit.get("objectID", "").upper()
                    if not sku:
                        continue
                        
                    # Extract name from name_en (fallback to other locales if needed)
                    name = hit.get("name_en", f"TAG Heuer {sku}")
                    
                    # Extract THB price from price_TL (which represents THB currency in their Algolia structure)
                    price_data = hit.get("price_TL", {})
                    if not price_data:
                        # Fallback: check all price keys for THB currency
                        for k, v in hit.items():
                            if k.startswith("price_") and isinstance(v, dict):
                                if v.get("currency") == "THB":
                                    price_data = v
                                    break
                                    
                    price = 0
                    if price_data:
                        try:
                            price = int(float(price_data.get("price", 0)))
                        except:
                            price = 0
                            
                    # Extract image and collection
                    image_field = hit.get("image", "")
                    if not image_field:
                        continue
                        
                    collection = clean_collection_name(image_field)
                    
                    # Generate clean official permalink
                    # Standard collections: carrera, aquaracer, formula-1, monaco, link
                    coll_slug = collection.lower().replace("_", "-")
                    permalink = f"https://www.tagheuer.com/th/en/timepieces/collections/{coll_slug}/{sku}.html"
                    
                    if collection not in collection_catalogs:
                        collection_catalogs[collection] = []
                        
                    collection_catalogs[collection].append({
                        "sku": sku,
                        "name": name,
                        "price_thb": price,
                        "permalink": permalink
                    })
                    
                    # Prepare image download task
                    # Clean non-hashed CDN template
                    img_url = f"https://www.tagheuer.com/on/demandware.static/-/Sites-tagheuer-master/default/{image_field}"
                    target_name = f"{sku}__Soldier.png"
                    target_path = ROOT_DIR / collection / target_name
                    
                    download_tasks.append(download_image(client, sem, img_url, target_path))
                    total_scraped += 1
                    
                total_pages = res.get("nbPages", 0)
                page += 1
                if page >= total_pages:
                    log.info("Reached end of paginated query.")
                    break
            except Exception as e:
                log.error(f"Error fetching page {page}: {e}")
                break
                
        log.info(f"Total structured watch records found: {total_scraped}")
        
        # Execute all image downloads concurrently
        if download_tasks:
            log.info(f"Starting parallel download of {len(download_tasks)} watch images...")
            results = await asyncio.gather(*download_tasks)
            downloaded = sum(1 for r in results if r)
            log.info(f"Finished downloading {downloaded} new images.")
            
        # Write CSV catalogs
        log.info("Writing CSV catalogs...")
        for collection, rows in collection_catalogs.items():
            coll_dir = ROOT_DIR / collection
            coll_dir.mkdir(parents=True, exist_ok=True)
            csv_path = coll_dir / "_catalog.csv"
            
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
                    for sku in sorted(existing_rows.keys()):
                        writer.writerow(existing_rows[sku])
                log.info(f"Saved {len(existing_rows)} catalog entries to {csv_path}")
            except Exception as e:
                log.error(f"Failed to write CSV catalog at {csv_path}: {e}")

    log.info("TAG Heuer Thailand scraping pipeline completed successfully!")

if __name__ == "__main__":
    asyncio.run(scrape_tagheuer())
