import asyncio
import csv
import json
import logging
from pathlib import Path
import re
import sys
from curl_cffi import requests

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("scrape_rolex_th")

ROOT_DIR = Path("/Users/kritsada/Desktop/Luxury Watch/Rolex")
CONCURRENCY = 8
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA}

# Discovered working Rolex TH image template:
IMAGE_TEMPLATE = "https://media.rolex.com/image/upload/q_auto:eco/f_jpg/t_v7-grid/c_limit,w_1920/v1/a677b2c664f6/catalogue/2026/upright-bba-with-shadow/{rmc}"

# Precise family mapping to match existing folder names in official/Rolex/
FAMILY_MAP = {
    "submariner": "Submariner",
    "submariner-date": "Submariner",
    "datejust": "Datejust",
    "datejust-41": "Datejust",
    "datejust-36": "Datejust",
    "datejust-31": "Datejust",
    "day-date": "Day-Date",
    "day-date-40": "Day-Date",
    "day-date-36": "Day-Date",
    "gmt-master-ii": "GMT-Master-II",
    "cosmograph-daytona": "Cosmograph-Daytona",
    "yacht-master": "Yacht-Master",
    "yacht-master-ii": "Yacht-Master-II",
    "sky-dweller": "Sky-Dweller",
    "sea-dweller": "Sea-Dweller",
    "rolex-deepsea": "Deepsea",
    "deepsea": "Deepsea",
    "air-king": "Air-King",
    "explorer": "Explorer",
    "explorer-ii": "Explorer-II",
    "lady-datejust": "Lady-Datejust",
    "oyster-perpetual": "Oyster-Perpetual",
    "oyster-perpetual-41": "Oyster-Perpetual",
    "oyster-perpetual-36": "Oyster-Perpetual",
    "oyster-perpetual-34": "Oyster-Perpetual",
    "oyster-perpetual-31": "Oyster-Perpetual",
    "oyster-perpetual-28": "Oyster-Perpetual",
    "1908": "1908",
    "perpetual-1908": "1908",
    "land-dweller": "Land-Dweller",
    "land-dweller-40": "Land-Dweller",
}

async def download_image(session, sem: asyncio.Semaphore, url: str, out_path: Path) -> bool:
    if out_path.exists() and out_path.stat().st_size > 1000:
        try:
            with open(out_path, "rb") as f:
                magic = f.read(2)
            if magic == b"\xff\xd8":
                return False
        except Exception:
            pass
    async with sem:
        try:
            # We can run blocking requests in an executor or use curl_cffi's AsyncSession.
            # Running requests.get inside asyncio's loop via run_in_executor is extremely clean and stable.
            loop = asyncio.get_event_loop()
            r = await loop.run_in_executor(
                None, 
                lambda: requests.get(url, impersonate="chrome", timeout=15.0)
            )
            if r.status_code == 200:
                out_path.parent.mkdir(parents=True, exist_ok=True)
                out_path.write_bytes(r.content)
                return True
            else:
                log.warning(f"Failed status {r.status_code} for image {url}")
        except Exception as e:
            log.warning(f"Failed to download image {url}: {e}")
    return False

def clean_family_name(title_code: str, family_code: str) -> str:
    # Use our standard map to get canonical collection directory name
    for code in [title_code, family_code]:
        if code in FAMILY_MAP:
            return FAMILY_MAP[code]
    
    # Fallback: clean the string capitalization
    code = family_code or title_code or "Others"
    parts = code.split("-")
    return "-".join(p.capitalize() for p in parts)

def scrape_rolex():
    log.info("Starting Rolex Thailand scraping pipeline...")
    ROOT_DIR.mkdir(parents=True, exist_ok=True)

    url = "https://www.rolex.com/th-th/watches/find-rolex?group=0"
    log.info(f"Connecting to Rolex TH with browser impersonation: {url}")
    
    try:
        r = requests.get(url, impersonate="chrome", timeout=30.0)
        if r.status_code != 200:
            log.error(f"Failed to load page: HTTP {r.status_code}")
            sys.exit(1)
        html = r.text
    except Exception as e:
        log.error(f"Connection failed: {e}")
        sys.exit(1)

    log.info(f"Successfully fetched page! HTML size: {len(html)} characters.")

    # Search for Script tag #5 which contains the watch configurator entries
    script_pattern = re.compile(r'<script([^>]*)>(.*?)</script>', re.DOTALL | re.IGNORECASE)
    scripts = script_pattern.findall(html)
    
    best_script = ""
    for idx, (attrs, content) in enumerate(scripts):
        if '"rmc"' in content and '"formattedPrice"' in content:
            best_script = content
            log.info(f"Found watch database in Script #{idx} (length={len(content)}).")
            break

    if not best_script:
        log.error("Failed to find watch database script tag in HTML response!")
        sys.exit(1)

    # Parse flat watch entries inside the script
    watch_entries = re.findall(r'\{[^{}]*"rmc"[^{}]*\}', best_script)
    log.info(f"Successfully extracted {len(watch_entries)} watch entries!")

    collection_catalogs = {}  # collection_name -> list of watch dicts
    download_jobs = []

    for entry in watch_entries:
        cleaned_match = re.search(r'\{.*\}', entry)
        if not cleaned_match:
            continue
        try:
            obj = json.loads(cleaned_match.group(0))
        except:
            continue
        
        rmc = obj.get("rmc", "")
        if not rmc:
            continue
        
        sku = rmc.upper()
        # Rich description from 'alt' includes case size, material, dial color, etc.
        name = obj.get("alt", obj.get("title", f"Rolex {sku}"))
        
        price = obj.get("price", None)
        title_code = obj.get("titleCode", "")
        family_code = obj.get("familyCode", "")
        
        # Build collection name and standard canonical folder
        collection = clean_family_name(title_code, family_code)
        
        # Build official permalink
        permalink = f"https://www.rolex.com/th-th/watches/{family_code or title_code}/{rmc}"
        
        if collection not in collection_catalogs:
            collection_catalogs[collection] = []
        collection_catalogs[collection].append({
            "sku": sku,
            "name": name,
            "price_thb": price,
            "permalink": permalink
        })

        # Construct image URL
        img_url = IMAGE_TEMPLATE.format(rmc=rmc)
        target_name = f"{sku}__upright.jpg"
        target_path = ROOT_DIR / collection / target_name
        
        download_jobs.append((img_url, target_path))

    log.info(f"Organized {len(download_jobs)} watches across {len(collection_catalogs)} collections.")

    # Execute all downloads concurrently in asyncio loop
    async def run_downloads():
        sem = asyncio.Semaphore(CONCURRENCY)
        tasks = []
        for url, path in download_jobs:
            tasks.append(download_image(None, sem, url, path))
        
        log.info(f"Starting parallel download of {len(tasks)} watch upright images...")
        results = await asyncio.gather(*tasks)
        downloaded = sum(1 for r in results if r)
        log.info(f"Finished downloading {downloaded} new Rolex images.")

    asyncio.run(run_downloads())

    # Write CSV catalogs
    log.info("Writing Rolex CSV catalogs...")
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

    log.info("Rolex Thailand scraping pipeline completed successfully!")

if __name__ == "__main__":
    scrape_rolex()
