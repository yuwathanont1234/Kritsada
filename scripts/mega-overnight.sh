#!/usr/bin/env bash
# ============================================================
# mega-overnight.sh — Combo C: full pipeline for one session
# ============================================================
# Runs end-to-end in sequence:
#   Step 1: TypeScript regression check                   ~1 min
#   Step 2: Scrape + index 15 missing brands (Apify+RAG)  ~2 hr
#   Step 3: Refine model+ref metadata via Gemini Flash    ~2 hr
#   Step 4: Seed price cache (168 refs)                   ~45 min
#   Step 5: Reproject all image_embeddings (probe-v4)     ~30 min
#   Step 6: Cost telemetry SQL output                     ~1 min
#
# Total time: ~5-6 hours
# Total cost: ~฿400 (Apify ~฿55 + Gemini ~฿130 + price ~฿200 + Replicate ~฿37)
#
# Usage:
#   chmod +x scripts/mega-overnight.sh
#   ./scripts/mega-overnight.sh 2>&1 | tee mega-overnight-$(date +%Y%m%d).log
#
# Optional env overrides:
#   APIFY_LIMIT=100   # Default 50, max ~$0.20 per brand
#   SKIP_TSC=1        # Skip Step 1 (faster startup)
#   SKIP_REFINE=1     # Skip Step 3 if you want to do it manually later
#
# Safe to Ctrl+C between steps — each is independent + idempotent.
# Re-running skips already-done work (cached files, refined rows, etc.)
# ============================================================

set -u
cd "$(dirname "$0")/.."

APIFY_LIMIT="${APIFY_LIMIT:-50}"
SKIP_TSC="${SKIP_TSC:-0}"
SKIP_REFINE="${SKIP_REFINE:-0}"

BRAND_PAIRS=(
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
hr() { echo "════════════════════════════════════════════════════════════"; }

T0=$(date +%s)
hr
log "🌙 MEGA OVERNIGHT — Combo C starting"
log "    APIFY_LIMIT=$APIFY_LIMIT  SKIP_TSC=$SKIP_TSC  SKIP_REFINE=$SKIP_REFINE"
log "    Brands queued: ${#BRAND_PAIRS[@]}"
hr

# ── Step 1: TypeScript regression check ─────────────────────
if [ "$SKIP_TSC" = "0" ]; then
  log ""
  log "═ Step 1/6: TypeScript regression check ═"
  if npx tsc --noEmit -p tsconfig.json 2>&1 | tail -10; then
    log "✅ Step 1 PASS — tsc clean"
  else
    log "⚠️  Step 1 FAIL — tsc errors above. Continuing anyway."
  fi
else
  log "⏭  Step 1 skipped (SKIP_TSC=1)"
fi

# ── Step 2: Scrape + index 15 brands ────────────────────────
log ""
log "═ Step 2/6: Scrape + index 15 missing brands ═"
log "  ⏱  ETA: ~2 hours"
log "  💰 Cost: ~฿90 (Apify + Replicate)"

for pair in "${BRAND_PAIRS[@]}"; do
  IFS='|' read -r display folder <<< "$pair"
  log "  ── ${display} (folder=${folder}) ──"

  log "    ⬇  scrape_apify.py limit=$APIFY_LIMIT"
  python3 scripts/scrape_apify.py --brand "$display" --limit "$APIFY_LIMIT" 2>&1 \
    | tail -15 | sed 's/^/      /'

  log "    🧠 index_to_image_embeddings.py"
  python3 scripts/index_to_image_embeddings.py --brand "$folder" 2>&1 \
    | tail -3 | sed 's/^/      /'
done
log "✅ Step 2 done"

# ── Step 3: Refine model+ref via Gemini Flash ───────────────
if [ "$SKIP_REFINE" = "0" ]; then
  log ""
  log "═ Step 3/6: Refine model+ref metadata via Gemini Flash ═"
  log "  ⏱  ETA: ~2 hours"
  log "  💰 Cost: ~฿130 (Gemini Flash, ~$0.005/image)"

  for pair in "${BRAND_PAIRS[@]}"; do
    IFS='|' read -r display folder <<< "$pair"
    log "  ── refining ${folder} ──"
    python3 scripts/refine_watches_metadata.py --brand "$folder" --limit 100 2>&1 \
      | tail -12 | sed 's/^/      /'
  done
  log "✅ Step 3 done"
else
  log "⏭  Step 3 skipped (SKIP_REFINE=1)"
fi

# ── Step 4: Seed price cache (168 refs) ─────────────────────
log ""
log "═ Step 4/6: Pre-seed price cache (168 refs total) ═"
log "  ⏱  ETA: ~45 minutes"
log "  💰 Cost: ~฿200 (Gemini grounded search)"

npx ts-node scripts/seed-price-cache.ts 2>&1 | tail -30 | sed 's/^/  /'
log "✅ Step 4 done"

# ── Step 5: Reproject all image_embeddings ──────────────────
log ""
log "═ Step 5/6: Reproject all image_embeddings.image_embedding_v2 ═"
log "  ⏱  ETA: ~30 minutes"
log "  💰 Cost: \$0 (local NumPy, no Replicate calls)"

if [ -f scripts/output/probe_v4_weights.npz ]; then
  python3 scripts/reproject_image_embeddings.py \
    --weights scripts/output/probe_v4_weights.npz 2>&1 \
    | tail -20 | sed 's/^/  /'
  log "✅ Step 5 done"
else
  log "⚠️  Step 5 skipped — probe_v4_weights.npz not found at scripts/output/"
  log "    (already-indexed rows already use probe-v4; reproject only needed"
  log "     if probe weights changed since their original index time)"
fi

# ── Step 6: Cost telemetry SQL ──────────────────────────────
log ""
log "═ Step 6/6: Cost telemetry SQL — paste into Supabase Dashboard ═"
cat <<'SQL'

  ─── Average cost per scan — last 7 days, daily bucket ───
  SELECT
    DATE(created_at AT TIME ZONE 'Asia/Bangkok') AS day,
    COUNT(*) FILTER (WHERE type = 'scan') AS scans,
    ROUND(SUM(cost_usd)::numeric, 4) AS total_usd,
    ROUND((AVG(cost_usd) FILTER (WHERE type = 'scan'))::numeric * 35, 2) AS avg_thb_per_scan
  FROM public.cost_events
  WHERE created_at > now() - INTERVAL '7 days'
  GROUP BY 1
  ORDER BY day DESC;

  ─── Per-brand embedding coverage (verify Step 2 + 3) ───
  SELECT brand, COUNT(*) AS rows, MAX(created_at) AS last_added
  FROM public.watches
  WHERE brand IN (
    'A. Lange & Söhne','F.P. Journe','Jaeger-LeCoultre','Hublot',
    'Breitling','Zenith','Bvlgari','Franck Muller','Girard-Perregaux',
    'MB&F','URWERK','Bovet','Ulysse Nardin','Parmigiani Fleurier',
    'Longines','Seiko'
  )
  GROUP BY brand
  ORDER BY rows DESC;

  ─── Price cache coverage (verify Step 4) ───
  SELECT COUNT(*) AS cached_refs,
         COUNT(*) FILTER (WHERE expires_at > now()) AS still_fresh
  FROM public.watch_price_cache;
SQL

# ── Final summary ────────────────────────────────────────────
TF=$(date +%s)
DT=$((TF - T0))
HRS=$((DT / 3600))
MINS=$(( (DT % 3600) / 60 ))

log ""
hr
log "🌙 MEGA OVERNIGHT complete!"
log "    Total elapsed: ${HRS}h ${MINS}m"
log ""
log "  Tomorrow morning:"
log "    1. Paste Step 6 SQL into Supabase Dashboard → verify counts"
log "    2. Reload mobile app + scan a Hublot/Longines/Seiko"
log "       → expect '[aiRouter] DB-validated ✓' in logs"
log "    3. Check cost_events for avg/scan trend (Step 6 query)"
log "    4. Read refine trace: scripts/output/refine_watches_log.jsonl"
hr
