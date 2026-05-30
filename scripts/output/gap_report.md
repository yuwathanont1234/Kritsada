# Watch Reference Dataset — Gap Report

Generated against `embedding_version = dinov3-vitl16/probe-v3`.

**Goal**: every `(brand, ref)` class should have ≥ **10 samples** to support solid retrieval.

**Current**: 28 brands · 103 classes · 3869 rows.

## Class size distribution

| Tier | Classes |
|---|---:|
| 1-only | 22 |
| 2-4 (very weak) | 14 |
| 5-9 (weak) | 15 |
| 10-19 (ok) | 11 |
| 20-49 (good) | 20 |
| 50+ (excellent) | 21 |

## Critical gaps (< 10 samples)

Each row below is a class that needs more reference images.
`target_add` is how many more samples to reach the threshold.

| Brand | Ref | Current | Need | CDN host | Brand watch page |
|---|---|---:|---:|---|---|
| Audemars Piguet | Millenary | 1 | +9 | `dynamicmedia.audemarspiguet.com` | [https://www.audemarspiguet.com/com/en/home.html](https://www.audemarspiguet.com/com/en/home.html) |
| Audemars Piguet | Code 11.59 | 5 | +5 | `dynamicmedia.audemarspiguet.com` | [https://www.audemarspiguet.com/com/en/home.html](https://www.audemarspiguet.com/com/en/home.html) |
| Audemars Piguet | Other | 7 | +3 | `dynamicmedia.audemarspiguet.com` | [https://www.audemarspiguet.com/com/en/home.html](https://www.audemarspiguet.com/com/en/home.html) |
| Bovet | Cortina Extra | 4 | +6 | `?` | [?](?) |
| Cartier | Tank Louis | 1 | +9 | `cartier.com/dw/image/v2` | [https://www.cartier.com/en-us/watches](https://www.cartier.com/en-us/watches) |
| Chopard | Alpine Eagle | 1 | +9 | `objects-prod.cdn.chopard.com` | [https://www.chopard.com/en/watches](https://www.chopard.com/en/watches) |
| Chopard | Mille Miglia | 2 | +8 | `objects-prod.cdn.chopard.com` | [https://www.chopard.com/en/watches](https://www.chopard.com/en/watches) |
| Chopard | L.U.C | 2 | +8 | `objects-prod.cdn.chopard.com` | [https://www.chopard.com/en/watches](https://www.chopard.com/en/watches) |
| Chopard | Happy Sport | 4 | +6 | `objects-prod.cdn.chopard.com` | [https://www.chopard.com/en/watches](https://www.chopard.com/en/watches) |
| De Bethune | Watches | 3 | +7 | `?` | [?](?) |
| F.P. Journe | Watches | 6 | +4 | `fpjourne.com` | [https://www.fpjourne.com/en/collections](https://www.fpjourne.com/en/collections) |
| Franck Muller | Cortina Extra | 6 | +4 | `images.squarespace-cdn.com` | [https://www.franckmuller.com/collections](https://www.franckmuller.com/collections) |
| Franck Muller | Long Island | 8 | +2 | `images.squarespace-cdn.com` | [https://www.franckmuller.com/collections](https://www.franckmuller.com/collections) |
| Girard-Perregaux | Watches | 8 | +2 | `girard-perregaux.com` | [https://www.girard-perregaux.com/en/collections](https://www.girard-perregaux.com/en/collections) |
| Hublot | MP | 3 | +7 | `hublot.com` | [https://www.hublot.com/en-us/watches](https://www.hublot.com/en-us/watches) |
| Hublot | Classic Fusion | 4 | +6 | `hublot.com` | [https://www.hublot.com/en-us/watches](https://www.hublot.com/en-us/watches) |
| Hublot | Big Bang | 8 | +2 | `hublot.com` | [https://www.hublot.com/en-us/watches](https://www.hublot.com/en-us/watches) |
| Louis Erard | Watches | 4 | +6 | `?` | [?](?) |
| MB&F | Watches | 6 | +4 | `mbandf.com` | [https://www.mbandf.com/en/machines](https://www.mbandf.com/en/machines) |
| Omega | Speedmaster | 3 | +7 | `omegawatches.com/media` | [https://www.omegawatches.com/watches](https://www.omegawatches.com/watches) |
| Omega | Seamaster | 5 | +5 | `omegawatches.com/media` | [https://www.omegawatches.com/watches](https://www.omegawatches.com/watches) |
| Panerai | Luminor | 4 | +6 | `panerai.com/content/dam` | [https://www.panerai.com/us/en/collections](https://www.panerai.com/us/en/collections) |
| Parmigiani Fleurier | Watches | 3 | +7 | `?` | [?](?) |
| Patek Philippe | Twenty-4 | 5 | +5 | `patek-res.cloudinary.com` | [https://www.patek.com/en/collection](https://www.patek.com/en/collection) |
| Rolex | 1908 | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Air-King | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Datejust | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Day-Date | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Daytona | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Deepsea | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Explorer | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Explorer II | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | GMT-Master II | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Lady-Datejust | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Land-Dweller | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Oyster Perpetual | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Sea-Dweller | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Sky-Dweller | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Yacht-Master | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Yacht-Master II | 1 | +9 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Rolex | Submariner | 6 | +4 | `media.rolex.com` | [https://www.rolex.com/watches](https://www.rolex.com/watches) |
| Seiko | Grand Seiko | 1 | +9 | `seikowatches.com/-/media` | [https://www.seikowatches.com/global-en/products](https://www.seikowatches.com/global-en/products) |
| TAG Heuer | Formula 1 | 1 | +9 | `tagheuer.com` | [https://www.tagheuer.com/us/en/watches](https://www.tagheuer.com/us/en/watches) |
| TAG Heuer | Monaco | 3 | +7 | `tagheuer.com` | [https://www.tagheuer.com/us/en/watches](https://www.tagheuer.com/us/en/watches) |
| TAG Heuer | Carrera | 4 | +6 | `tagheuer.com` | [https://www.tagheuer.com/us/en/watches](https://www.tagheuer.com/us/en/watches) |
| TAG Heuer | Aquaracer | 6 | +4 | `tagheuer.com` | [https://www.tagheuer.com/us/en/watches](https://www.tagheuer.com/us/en/watches) |
| Tudor | 1926 | 1 | +9 | `media.tudorwatch.com` | [https://www.tudorwatch.com/watches](https://www.tudorwatch.com/watches) |
| Tudor | Royal | 5 | +5 | `media.tudorwatch.com` | [https://www.tudorwatch.com/watches](https://www.tudorwatch.com/watches) |
| Tudor | Pelagos | 5 | +5 | `media.tudorwatch.com` | [https://www.tudorwatch.com/watches](https://www.tudorwatch.com/watches) |
| URWERK | Watches | 3 | +7 | `urwerk.com` | [https://www.urwerk.com/en/timepieces](https://www.urwerk.com/en/timepieces) |
| Ulysse Nardin | Watches | 5 | +5 | `ulysse-nardin.com` | [https://www.ulysse-nardin.com/en/watch-collection](https://www.ulysse-nardin.com/en/watch-collection) |

**Total critical gaps**: 51

## Top easy wins (brands with known CDN + many gaps)

These brands already have a known CDN pattern in the README, so
filling gaps just means listing more product URLs in `_<brand>_urls.txt`
and running the existing downloader.

| Brand | Gap classes | Images needed |
|---|---:|---:|
| Rolex | 17 | +148 |
| Chopard | 4 | +31 |
| TAG Heuer | 4 | +26 |
| Tudor | 3 | +19 |
| Audemars Piguet | 3 | +17 |
| Hublot | 3 | +15 |
| Omega | 2 | +12 |
| Cartier | 1 | +9 |
| Seiko | 1 | +9 |
| URWERK | 1 | +7 |
| Franck Muller | 2 | +6 |
| Panerai | 1 | +6 |
| Patek Philippe | 1 | +5 |
| Ulysse Nardin | 1 | +5 |
| F.P. Journe | 1 | +4 |
| MB&F | 1 | +4 |
| Girard-Perregaux | 1 | +2 |

## Singleton classes (22 — top priority)

These have a single sample and can't be trained on. Each needs 
at least 5 more images before the next probe retraining.

### Audemars Piguet / Millenary
- Brand site: https://www.audemarspiguet.com/com/en/home.html
- Google query: `"Audemars Piguet Millenary" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Audemars+Piguet+Millenary

### Cartier / Tank Louis
- Brand site: https://www.cartier.com/en-us/watches
- Google query: `"Cartier Tank Louis" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Cartier+Tank+Louis

### Chopard / Alpine Eagle
- Brand site: https://www.chopard.com/en/watches
- Google query: `"Chopard Alpine Eagle" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Chopard+Alpine+Eagle

### Rolex / 1908
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex 1908" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+1908

### Rolex / Air-King
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Air-King" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Air-King

### Rolex / Datejust
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Datejust" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Datejust

### Rolex / Day-Date
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Day-Date" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Day-Date

### Rolex / Daytona
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Daytona" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Daytona

### Rolex / Deepsea
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Deepsea" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Deepsea

### Rolex / Explorer
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Explorer" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Explorer

### Rolex / Explorer II
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Explorer II" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Explorer+II

### Rolex / GMT-Master II
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex GMT-Master II" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+GMT-Master+II

### Rolex / Lady-Datejust
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Lady-Datejust" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Lady-Datejust

### Rolex / Land-Dweller
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Land-Dweller" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Land-Dweller

### Rolex / Oyster Perpetual
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Oyster Perpetual" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Oyster+Perpetual

### Rolex / Sea-Dweller
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Sea-Dweller" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Sea-Dweller

### Rolex / Sky-Dweller
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Sky-Dweller" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Sky-Dweller

### Rolex / Yacht-Master
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Yacht-Master" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Yacht-Master

### Rolex / Yacht-Master II
- Brand site: https://www.rolex.com/watches
- Google query: `"Rolex Yacht-Master II" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Rolex+Yacht-Master+II

### Seiko / Grand Seiko
- Brand site: https://www.seikowatches.com/global-en/products
- Google query: `"Seiko Grand Seiko" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Seiko+Grand+Seiko

### TAG Heuer / Formula 1
- Brand site: https://www.tagheuer.com/us/en/watches
- Google query: `"TAG Heuer Formula 1" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=TAG+Heuer+Formula+1

### Tudor / 1926
- Brand site: https://www.tudorwatch.com/watches
- Google query: `"Tudor 1926" watch official site`
- Chrono24 listing: https://www.chrono24.com/search/index.htm?query=Tudor+1926
