#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/it-project-console
BASE="$ROOT/backups/full"
[[ "$(readlink -f "$ROOT")" == "$ROOT" && ! -L "$BASE" ]] || exit 1
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
STATUS="$ROOT/backups/daily-status.txt"
record_result() {
 local code=$? state=SUCCESS
 if (( code != 0 )); then state=FAILED; fi
 printf '%s %s\n' "$state" "$(date -u +%FT%TZ)" > "$STATUS"
 exit "$code"
}
trap record_result EXIT
if bash "$SCRIPT_DIR/backup-full.sh"; then
 :
else
 printf 'FAILED %s\n' "$(date -u +%FT%TZ)" > "$STATUS"
 exit 1
fi
# Retain newest 14 complete batches. A PIN file keeps a batch indefinitely.
listing=$(find "$BASE" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z-*' | sort -r)
mapfile -t batches <<< "$listing"
count=0
for dir in "${batches[@]}"; do
 [[ -f "$dir/COMPLETE" && ! -L "$dir" ]] || continue
 [[ "$(readlink -f "$dir")" == "$dir" && "$dir" =~ ^/opt/it-project-console/backups/full/[0-9]{8}T[0-9]{6}Z-[0-9]+$ ]] || exit 1
 count=$((count+1))
 if (( count > 14 )) && [[ ! -e "$dir/PIN" ]]; then rm -rf -- "$dir"; fi
done
