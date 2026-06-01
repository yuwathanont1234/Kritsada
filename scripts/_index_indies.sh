#!/usr/bin/env bash
# Low-concurrency (-P 2, under Replicate's 60/min create limit) pass for the 26
# niche indie brands still at 0 rows in image_embeddings. Small folders (1-10
# imgs); corrupt source images fail-fast (no retry). Idempotent + resumable.
set -u
cd "$(dirname "$0")/.." || exit 1
LOG=scripts/output/idxlogs
mkdir -p "$LOG"
: > "$LOG/_indie_progress.log"

printf '%s\n' \
  Angelus Arnold_Son Bell_Ross Blancpain Breguet CVSTOS Christiaan_van_der_Klaauw \
  Czapek Gorilla Greubel_Forsey H_Moser HYT Jacob_Co Lang_Heyne Laurent_Ferrier \
  Lederer Louis_Erard Louis_Moinet Montblanc Moritz_Grossmann Nomos Nivada_Grenchen \
  Oris Swatch_MoonSwatch Trilobe Edouard_Koehn \
| xargs -P 2 -L1 bash -c '
    b="$1"
    python3 scripts/index_to_image_embeddings.py --brand "$b" --shard 0/1 >> "'"$LOG"'/indie_${b}.log" 2>&1
    res=$(grep -oE "new=[0-9]+ skipped=[0-9]+ failed=[0-9]+" "'"$LOG"'/indie_${b}.log" | tail -1)
    echo "$(date +%H:%M:%S) DONE $b | $res" >> "'"$LOG"'/_indie_progress.log"
  ' _

echo "$(date +%H:%M:%S) ===== INDIES COMPLETE =====" >> "$LOG/_indie_progress.log"
