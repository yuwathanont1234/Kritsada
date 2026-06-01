#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# ONE-OFF (2026-05-31): close the live-RAG coverage gap. Indexes the 34
# /official brands that had ZERO rows in image_embeddings (per
# scripts/_audit_coverage.ts) into the 1024-d table the mobile app's
# match_watches RPC queries. Giants are stride-sharded for parallelism;
# 8-wide via xargs. Idempotent + resumable (the python skips already-indexed
# image_url), so safe to re-run if interrupted. Delete after the gap is closed.
# ─────────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")/.." || exit 1
LOGDIR="scripts/output/idxlogs"
mkdir -p "$LOGDIR"
: > "$LOGDIR/_progress.log"

# job = "Brand_Folder shard"  (shard 0/1 = whole brand; giants split for speed)
printf '%s\n' \
  'Tissot 0/6' 'Tissot 1/6' 'Tissot 2/6' 'Tissot 3/6' 'Tissot 4/6' 'Tissot 5/6' \
  'Richard_Mille 0/3' 'Richard_Mille 1/3' 'Richard_Mille 2/3' \
  'IWC 0/3' 'IWC 1/3' 'IWC 2/3' \
  'Frederique_Constant 0/2' 'Frederique_Constant 1/2' \
  'Piaget 0/1' 'Hamilton 0/1' 'Vacheron_Constantin 0/1' \
  'Angelus 0/1' 'Arnold_Son 0/1' 'Bell_Ross 0/1' 'Blancpain 0/1' 'Breguet 0/1' \
  'CVSTOS 0/1' 'Christiaan_van_der_Klaauw 0/1' 'Czapek 0/1' 'De_Bethune 0/1' \
  'Edouard_Koehn 0/1' 'Gorilla 0/1' 'Greubel_Forsey 0/1' 'HYT 0/1' 'H_Moser 0/1' \
  'Jacob_Co 0/1' 'Lang_Heyne 0/1' 'Laurent_Ferrier 0/1' 'Lederer 0/1' \
  'Louis_Erard 0/1' 'Louis_Moinet 0/1' 'Montblanc 0/1' 'Moritz_Grossmann 0/1' \
  'Nivada_Grenchen 0/1' 'Nomos 0/1' 'Oris 0/1' 'Swatch_MoonSwatch 0/1' 'Trilobe 0/1' \
| xargs -P 8 -L1 bash -c '
    b="$1"; s="$2"; tag="${s//\//-}"
    log="'"$LOGDIR"'/${b}_${tag}.log"
    echo "$(date +%H:%M:%S) START $b $s" >> "'"$LOGDIR"'/_progress.log"
    python3 scripts/index_to_image_embeddings.py --brand "$b" --shard "$s" >> "$log" 2>&1
    rc=$?
    done_line=$(grep -oE "DONE in .*new=[0-9]+ skipped=[0-9]+ failed=[0-9]+" "$log" | tail -1)
    echo "$(date +%H:%M:%S) END   $b $s rc=$rc | $done_line" >> "'"$LOGDIR"'/_progress.log"
  ' _

echo "$(date +%H:%M:%S) ===== ORCHESTRATOR COMPLETE =====" >> "$LOGDIR/_progress.log"
