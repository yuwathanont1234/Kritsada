#!/usr/bin/env bash
# ============================================================
# seed-all-brands.sh — Scrape + index all 15 missing brands
# ============================================================
# Wraps the 2-step pipeline (scrape_apify.py → index_to_image_embeddings.py)
# in a loop over every brand the app supports but DB lacks.
#
# Usage:
#   chmod +x scripts/seed-all-brands.sh
#   ./scripts/seed-all-brands.sh 2>&1 | tee seed-all-$(date +%Y%m%d).log
#
# Cost (approximate):
#   • Apify: 15 brands × 50 items × $0.0019 = ~$1.50 (~฿55)
#   • Replicate DINOv3: ~750 images × $0.0014 = ~$1.05 (~฿37)
#   • Total: ~$2.50 (~฿90)
#
# Time:
#   • Scrape: ~3-5 min/brand × 15 = ~60-75 min
#   • Index:  ~3-5 min/brand × 15 = ~60-75 min
#   • Total:  ~2-2.5 hours
#
# Safe to Ctrl+C between brands — each is independent + idempotent.
# Re-running skips already-cached images and DB rows.
# ============================================================

set -u
cd "$(dirname "$0")/.."

LIMIT="${LIMIT:-50}"  # Override with LIMIT=100 ./seed-all-brands.sh

# (display name, folder name) pairs — must match scrape_apify.py
# brand_to_folder() output and index_to_image_embeddings.py BRAND_DISPLAY.
BRANDS=(
  "A. Lange & Söhne|A_Lange_Sohne"
  "F.P. Journe|FP_Journe"
  "Jaeger-LeCoultre|Jaeger_LeCoultre"
  "Hublot|Hublot"
  "Breitling|Breitling"
  "Zenith|Zenith"
  "Bvlgari|Bvlgari"
  "Franck Muller|Franck_Muller"
  "Girard-Perregaux|Girard_Perregaux"
  "MB&F|MB_F"
  "URWERK|URWERK"
  "Bovet|Bovet"
  "Ulysse Nardin|Ulysse_Nardin"
  "Parmigiani Fleurier|Parmigiani_Fleurier"
  "Longines|Longines"
  "Seiko|Seiko"
)

ts() { date '+%H:%M:%S'; }
log() { echo "[$(ts)] $*"; }

log "════════════════════════════════════════════════════════════"
log "🌙 Seed-all-brands starting (LIMIT=$LIMIT per brand)"
log "    Total brands: ${#BRANDS[@]}"
log "════════════════════════════════════════════════════════════"

TOTAL_DOWNLOADED=0
TOTAL_INDEXED=0
TOTAL_FAILED=0

for pair in "${BRANDS[@]}"; do
  IFS='|' read -r display folder <<< "$pair"
  log ""
  log "═══ ${display} (folder=${folder}) ═══"

  # ── Step 1: Scrape via Apify ──
  log "  ⬇  Scraping…"
  if python3 scripts/scrape_apify.py --brand "$display" --limit "$LIMIT" 2>&1 \
       | tail -25 | sed 's/^/    /'; then
    log "  ✓ Scrape done"
  else
    log "  ✗ Scrape failed for $display — skipping index"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
    continue
  fi

  # ── Step 2: Index via DINOv3 + probe-v4 ──
  log "  🧠 Indexing into image_embeddings…"
  if python3 scripts/index_to_image_embeddings.py --brand "$folder" 2>&1 \
       | tail -5 | sed 's/^/    /'; then
    log "  ✓ Index done"
  else
    log "  ✗ Index failed for $folder"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi
done

log ""
log "════════════════════════════════════════════════════════════"
log "🌙 Seed-all-brands complete!"
log "    Failed brands: $TOTAL_FAILED / ${#BRANDS[@]}"
log ""
log "  Tomorrow morning:"
log "    1. Query Supabase to verify per-brand counts:"
log "       SELECT brand, COUNT(*) FROM image_embeddings"
log "       WHERE brand IN ('Hublot','Breitling','Zenith',...) GROUP BY brand;"
log "    2. Reload app + scan one watch per brand to confirm visual RAG hits"
log "════════════════════════════════════════════════════════════"
