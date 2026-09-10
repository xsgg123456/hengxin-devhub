#!/usr/bin/env bash
# Run only in a disposable container: /opt/it-project-console is a fixture.
set -Eeuo pipefail
[[ -f /.dockerenv && ! -e /opt/it-project-console ]] || exit 1
ROOT=/opt/it-project-console
mkdir -p "$ROOT/backups/full" /test/bin
cp /source/server/daily-backup.sh /test/daily-backup.sh
printf '#!/bin/sh\nexit 0\n' > /test/backup-full.sh
for i in $(seq -w 1 16); do
 mkdir "$ROOT/backups/full/202609${i}T030000Z-1"
 touch "$ROOT/backups/full/202609${i}T030000Z-1/COMPLETE"
done
touch "$ROOT/backups/full/20260901T030000Z-1/PIN"
bash /test/daily-backup.sh
[[ -d "$ROOT/backups/full/20260901T030000Z-1" && ! -d "$ROOT/backups/full/20260902T030000Z-1" ]]
[[ $(find "$ROOT/backups/full" -mindepth 1 -maxdepth 1 -type d | wc -l) == 15 ]]
grep -q '^SUCCESS ' "$ROOT/backups/daily-status.txt"
printf '#!/bin/sh\nexit 19\n' > /test/backup-full.sh
if bash /test/daily-backup.sh; then exit 1; fi
grep -q '^FAILED ' "$ROOT/backups/daily-status.txt"
printf '#!/bin/sh\nexit 0\n' > /test/backup-full.sh
printf '#!/bin/sh\nexit 23\n' > /test/bin/find
chmod +x /test/bin/find
if PATH="/test/bin:$PATH" bash /test/daily-backup.sh; then exit 1; fi
grep -q '^FAILED ' "$ROOT/backups/daily-status.txt"
echo 'PASS: retention, PIN preservation, backup failure, listing failure'
