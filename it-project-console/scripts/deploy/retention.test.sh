#!/usr/bin/env bash
set -euo pipefail
PRODUCT=$1
WORK=$(mktemp -d /tmp/itpc-release-test-retention.XXXXXX)
[[ "$(readlink -f "$WORK")" == "$WORK" && "$WORK" == /tmp/itpc-release-test-retention.* ]] || exit 1
trap 'rm -rf -- "$WORK"' EXIT
ROOT="$WORK/root"
SCRIPT="$PRODUCT/scripts/server/prune-releases.sh"
mkdir -p "$ROOT/releases" "$ROOT/incoming" "$ROOT/backups"
for tag in current previous old draft pinned uploading; do
  mkdir "$ROOT/releases/$tag"
  touch "$ROOT/incoming/itpc-$tag.tar.gz"
done
touch "$ROOT/releases/old/.deployed" "$ROOT/releases/pinned/.deployed" "$ROOT/releases/pinned/PIN"
touch "$ROOT/releases/uploading/.deployed" "$ROOT/incoming/.uploading-uploading"
touch "$ROOT/backups/preserve.sql" "$ROOT/incoming/operator.sh"
ln -s releases/current "$ROOT/current"
ln -s releases/previous "$ROOT/previous"
run() { bash "$SCRIPT" "$1" "$ROOT" current "${@:2}"; }
refused() { if "$@"; then echo 'Expected refusal' >&2; exit 1; fi; [[ -d "$ROOT/releases/old" ]]; }
run plan > "$WORK/plan"
grep -qx 'REMOVE=old' "$WORK/plan"
[[ -d "$ROOT/releases/old" ]]
refused bash "$SCRIPT" apply "$ROOT" wrong
ln -s releases/draft "$ROOT/pending"
refused run apply
rm "$ROOT/pending"
exec 8>"$ROOT/.release.lock"
flock -n 8
refused run apply
flock -u 8
rm "$ROOT/previous"
ln -s releases/missing "$ROOT/previous"
refused run apply
rm "$ROOT/previous"
ln -s releases/previous "$ROOT/previous"
ln -s "$ROOT/backups" "$ROOT/releases/escape"
refused run apply old escape
refused run apply old ../backups
rm "$ROOT/releases/escape"
mv "$ROOT/incoming/itpc-old.tar.gz" "$WORK/archive"
ln -s "$WORK/archive" "$ROOT/incoming/itpc-old.tar.gz"
refused run apply
rm "$ROOT/incoming/itpc-old.tar.gz"
mv "$WORK/archive" "$ROOT/incoming/itpc-old.tar.gz"
run apply > "$WORK/applied"
grep -qx 'REMOVED=old' "$WORK/applied"
[[ ! -e "$ROOT/releases/old" && ! -e "$ROOT/incoming/itpc-old.tar.gz" ]]
for tag in current previous draft pinned uploading; do
  [[ -d "$ROOT/releases/$tag" && -f "$ROOT/incoming/itpc-$tag.tar.gz" ]]
done
[[ -f "$ROOT/backups/preserve.sql" && -f "$ROOT/incoming/operator.sh" ]]
run apply current previous draft pinned > "$WORK/manual"
grep -qx 'REMOVED=draft' "$WORK/manual"
[[ -d "$ROOT/releases/current" && -d "$ROOT/releases/previous" && -d "$ROOT/releases/pinned" ]]
echo 'PASS: dry run, retention, pending, lock, pointers, traversal, links, PIN, drafts and explicit historical cleanup'
