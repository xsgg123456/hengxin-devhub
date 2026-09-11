#!/usr/bin/env bash
# Only package directories/archives; never Docker images, volumes or backups.
set -euo pipefail
umask 077
MODE=${1:-plan}
ROOT=${2:-/opt/it-project-console}
EXPECTED=${3:-}
[[ $# -ge 3 && "$MODE" =~ ^(plan|apply)$ ]] || exit 1
shift 3
[[ "$ROOT" == /opt/it-project-console || "$ROOT" == /tmp/itpc-release-test-* ]] || exit 1
[[ "$ROOT" != *..* && -d "$ROOT" && ! -L "$ROOT" && "$(readlink -f "$ROOT")" == "$ROOT" ]] || exit 1
for path in releases incoming; do
  [[ -d "$ROOT/$path" && ! -L "$ROOT/$path" ]] || exit 1
done
[[ ! -L "$ROOT/.release.lock" ]] || exit 1
exec 9>"$ROOT/.release.lock"
flock -n 9 || { echo 'Release operation active; cleanup refused.' >&2; exit 1; }
valid_tag() { [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$ && "$1" != *..* ]]; }
read_pointer() {
  local name=$1 target
  [[ -e "$ROOT/$name" || -L "$ROOT/$name" ]] || return 0
  [[ -L "$ROOT/$name" ]] || return 1
  target=$(readlink "$ROOT/$name")
  [[ "$target" == releases/* ]] || return 1
  valid_tag "${target#releases/}" || return 1
  [[ -d "$ROOT/$target" && ! -L "$ROOT/$target" && "$(readlink -f "$ROOT/$target")" == "$ROOT/$target" ]] || return 1
  printf '%s' "${target#releases/}"
}
CURRENT=$(read_pointer current)
PREVIOUS=$(read_pointer previous)
PENDING=$(read_pointer pending)
[[ -n "$CURRENT" && "$CURRENT" == "$EXPECTED" ]] || { echo 'Current changed or missing; cleanup refused.' >&2; exit 1; }
[[ -z "$PENDING" ]] || { echo 'Pending release; cleanup refused.' >&2; exit 1; }
printf 'KEEP=%s\n' "$CURRENT"
[[ -z "$PREVIOUS" ]] || printf 'KEEP=%s\n' "$PREVIOUS"
candidates=()
if (( $# )); then
  # Explicit historical inventory, only for an operator-authorized cleanup.
  candidates=("$@")
else
  for dir in "$ROOT"/releases/*; do
    [[ -f "$dir/.deployed" && ! -L "$dir/.deployed" ]] || continue
    candidates+=("${dir##*/}")
  done
fi
deletions=()
for tag in "${candidates[@]}"; do
  valid_tag "$tag" || exit 1
  [[ "$tag" != "$CURRENT" && "$tag" != "$PREVIOUS" ]] || continue
  dir="$ROOT/releases/$tag"
  [[ -d "$dir" && ! -L "$dir" && "$(readlink -f "$dir")" == "$dir" ]] || exit 1
  if [[ -e "$dir/PIN" || -L "$dir/PIN" ]]; then printf 'PIN=%s\n' "$tag"; continue; fi
  if [[ -e "$ROOT/incoming/.uploading-$tag" || -L "$ROOT/incoming/.uploading-$tag" ]]; then
    printf 'UPLOADING=%s\n' "$tag"; continue
  fi
  archive="$ROOT/incoming/itpc-$tag.tar.gz"
  [[ ! -L "$archive" && ( ! -e "$archive" || -f "$archive" ) ]] || exit 1
  deletions+=("$tag")
done
# Validate the complete plan before the first deletion. The release lock stays held.
for tag in "${deletions[@]}"; do
  if [[ "$MODE" == apply ]]; then
    rm -f -- "$ROOT/incoming/itpc-$tag.tar.gz"
    rm -rf -- "$ROOT/releases/$tag"
    printf 'REMOVED=%s\n' "$tag"
  else
    printf 'REMOVE=%s\n' "$tag"
  fi
done
