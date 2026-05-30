#!/usr/bin/env bash
# ============================================================
# overnight.sh — ไปนอน, ตื่นมาแอปดีขึ้น 🌙
# ============================================================
# รัน background jobs ที่ใช้เวลานานเป็นชั่วโมง:
#   1. TypeScript regression check (verify T1-T5 ไม่ break)
#   2. Price cache seed (97 refs, ~30-40 min)
#   3. pg_cron sanity SQL (output for manual paste)
#   4. Cost telemetry snapshot SQL (output for manual paste)
#   5. Wikimedia scrape — 15 missing brands (~30-90 min)
#   6. Git status summary
#
# Usage:
#   chmod +x scripts/overnight.sh
#   ./scripts/overnight.sh 2>&1 | tee overnight-$(date +%Y%m%d).log
#
# Logs to: overnight-YYYYMMDD.log (root of repo)
# Safe to Ctrl+C anytime — each job is independent
# ============================================================

set -u  # error on undefined vars, but allow individual failures

cd "$(dirname "$0")/.."

ts() { date '+%H:%M:%S'; }
log() { echo "[$(ts)] $*"; }

log "════════════════════════════════════════════════════════════"
log "🌙 Overnight pipeline starting"
log "════════════════════════════════════════════════════════════"

# ── Job 1: TypeScript regression check ──────────────────────
# Verifies our T1-T5 code changes compile cleanly. Should finish
# in <60s. If this fails, the rest of the pipeline still proceeds
# but you'll know to fix the type errors first thing in the morning.
log ""
log "═ Job 1/5: TypeScript regression check ═"
if npx tsc --noEmit -p tsconfig.json 2>&1; then
  log "✅ Job 1 PASS — tsc clean, no regressions"
else
  log "⚠️  Job 1 FAIL — tsc errors above. Check before deploying."
fi

# ── Job 2: Full price cache seed ────────────────────────────
# Long-running (~30-40 min). Calls Gemini grounded search for each
# of the 97 refs in scripts/seed-price-cache.ts. Skips refs already
# cached (so re-runs are cheap). Cost ~฿75 one-time, saves ~฿1,275/mo.
log ""
log "═ Job 2/5: Price cache seed (97 refs) ═"
log "  ⏱  ETA: 30-40 minutes"
log "  💰 One-time cost: ~฿75"
log "  💎 Future savings: ~฿1,275/month"
log ""
npx ts-node scripts/seed-price-cache.ts 2>&1 | sed 's/^/  /'
log "✅ Job 2 done"

# ── Job 3: Verify pg_cron jobs are scheduled ────────────────
# Outputs a SQL block you can paste into Supabase Dashboard
# next morning to verify all 4 expected jobs are present and active.
# (Direct SQL via supabase-cli would need DB credentials we don't
# automate — easier to inspect via Dashboard's SQL Editor.)
log ""
log "═ Job 3/5: pg_cron sanity SQL ═"
cat <<'SQL'

  ─── PASTE INTO SUPABASE DASHBOARD → SQL EDITOR ───
  SELECT jobid, jobname, schedule, active, command::text
  FROM cron.job
  WHERE jobname IN (
    'replicate-keepwarm',
    'reengage-cart-abandoned',
    'reengage-free-limit',
    'reengage-dormant',
    'refresh-funnel-daily'
  )
  ORDER BY jobname;

  -- Expected: 5 rows, all active=true.
  -- If any are missing, re-apply the corresponding migration.

  -- Bonus: see last 24h of cron runs (Supabase free tier > Sep 2024):
  SELECT jobname, status, return_message, start_time
  FROM cron.job_run_details rd
  JOIN cron.job j ON j.jobid = rd.jobid
  WHERE start_time > now() - INTERVAL '24 hours'
  ORDER BY start_time DESC LIMIT 50;
SQL
log "✅ Job 3 ready (manual SQL paste)"

# ── Job 4: Cost telemetry snapshot SQL ──────────────────────
# Compare yesterday vs week-ago average scan cost. After T1-T5 ship,
# yesterday's average should drop significantly.
log ""
log "═ Job 4/5: Cost telemetry SQL ═"
cat <<'SQL'

  ─── PASTE INTO SUPABASE DASHBOARD → SQL EDITOR ───
  -- Avg cost per scan, last 7 days, daily bucket
  SELECT
    DATE(created_at AT TIME ZONE 'Asia/Bangkok') AS day,
    COUNT(*) FILTER (WHERE type = 'scan') AS scans,
    ROUND(SUM(cost_usd)::numeric, 4) AS total_usd,
    ROUND(AVG(cost_usd) FILTER (WHERE type = 'scan')::numeric, 4) AS avg_per_scan_usd,
    ROUND(AVG(cost_usd) FILTER (WHERE type = 'scan')::numeric * 35, 2) AS avg_per_scan_thb
  FROM public.cost_events
  WHERE created_at > now() - INTERVAL '7 days'
  GROUP BY 1
  ORDER BY day DESC;

  -- Cost by type, last 24h — see where the money is going
  SELECT
    type,
    COUNT(*) AS calls,
    ROUND(SUM(cost_usd)::numeric, 4) AS total_usd,
    ROUND((SUM(cost_usd) * 35)::numeric, 2) AS total_thb
  FROM public.cost_events
  WHERE created_at > now() - INTERVAL '24 hours'
  GROUP BY type
  ORDER BY total_usd DESC;
SQL
log "✅ Job 4 ready (manual SQL paste)"

# ── Job 5: Scrape 15 missing brands from Wikimedia ─────────
# Downloads watch reference photos for brands the app supports but
# DB doesn't have indexed yet. Wikimedia is permissively licensed and
# doesn't block crawlers. Output goes to a local folder; a follow-up
# step (next session) will embed + upload to image_embeddings.
#
# ETA: ~30-90 min depending on Wikimedia response speed (~150 queries
#       × ~15 results/query × ~2s/download with concurrency).
# Network: ~500 MB-1 GB of image downloads to local disk.
log ""
log "═ Job 5/6: Wikimedia scrape — 15 missing brands ═"
log "  ⏱  ETA: 30-90 minutes"
log "  📁 Output: data/wikimedia_scrape/<brand>/Watches/*.jpg"
log ""
if [ -f scripts/scrape_wikimedia.py ]; then
  # Limit each query to keep total time bounded.
  # Filter to only the 15 new brands (skip the original Q3/Q4 wikimedia
  # brands which were scraped in past sessions — re-running them is
  # cheap but duplicates work).
  for brand in A_Lange_Sohne FP_Journe Jaeger_LeCoultre Hublot Breitling \
               Zenith Bvlgari Franck_Muller Girard_Perregaux \
               MB_F Urwerk Bovet Ulysse_Nardin Parmigiani_Fleurier \
               Longines Seiko; do
    log "  → scraping $brand..."
    python scripts/scrape_wikimedia.py --brand "$brand" 2>&1 \
      | tail -5 | sed 's/^/    /'
  done
  log "✅ Job 5 done"
else
  log "⚠️  scripts/scrape_wikimedia.py not found — skipping"
fi

# ── Job 6: Git status summary ───────────────────────────────
# Quick check of what's still uncommitted from this session so
# user can decide whether to commit fresh changes in the morning.
log ""
log "═ Job 6/6: Git status summary ═"
git status --short 2>&1 | sed 's/^/  /' || log "⚠️  git status failed"
log ""
log "  Branch tracking:"
git status -sb 2>&1 | head -3 | sed 's/^/  /'

# ── Final summary ───────────────────────────────────────────
log ""
log "════════════════════════════════════════════════════════════"
log "🌙 Overnight pipeline complete!"
log "  Log file: overnight-$(date +%Y%m%d).log"
log ""
log "  Tomorrow morning:"
log "    1. Read this log (Job 2 cache tally + Job 5 scrape counts)"
log "    2. Paste Jobs 3+4 SQL into Supabase Dashboard"
log "    3. ls -la '/Users/kritsada/Desktop/Luxury Watch/official/'"
log "       → verify 15 new brand folders downloaded"
log "    4. Next session: embed + index the scraped images via"
log "       python scripts/index_to_image_embeddings.py (per brand)"
log "    5. Reload app + scan a Rolex → confirm avg cost < ฿1.50"
log "════════════════════════════════════════════════════════════"
