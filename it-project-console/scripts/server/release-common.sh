#!/usr/bin/env bash
# Shared by the release entrypoint; never source server.env as shell code.
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
valid_tag() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$ && "$1" != *..* ]]; }
release_path() {
  valid_tag "$1" || fail "Invalid release tag: $1"
  local candidate="$ROOT/releases/$1"
  [[ -d "$candidate" && ! -L "$candidate" ]] || fail "Missing or symlink release: $candidate"
  [[ "$(readlink -f "$candidate")" == "$candidate" ]] || fail 'Release escapes root'
  printf '%s\n' "$candidate"
}
link_tag() {
  local link="$ROOT/$1" target
  [[ -e "$link" || -L "$link" ]] || return 0
  [[ -L "$link" ]] || fail "$link must be a symlink"
  target="$(readlink "$link")"
  [[ "$target" == releases/* && "$target" != */*/* ]] || fail "Unsafe $1 link"
  release_path "${target#releases/}" >/dev/null
  printf '%s\n' "${target#releases/}"
}
atomic_link() {
  local name="$1" tag="$2" temp="$ROOT/.$1.$$"
  [[ ! -e "$temp" && ! -L "$temp" ]] || fail "Temporary link exists: $temp"
  ln -s "releases/$tag" "$temp"
  mv -Tf "$temp" "$ROOT/$name"
}
migration_hash() {
  local path hash
  path="$(release_path "$1")"
  hash="$(sed -n 's/^MIGRATION_HASH=//p' "$path/release.env" | tr -d '\r')"
  [[ "$hash" =~ ^[a-f0-9]{64}$ ]] || fail "Missing/invalid MIGRATION_HASH in $path/release.env"
  printf '%s\n' "$hash"
}
release_value() {
  local dir="$1" key="$2" value
  value="$(sed -n "s/^${key}=//p" "$dir/release.env" | tr -d '\r')"
  [[ -n "$value" && "$value" =~ ^[A-Za-z0-9_./:@-]+$ ]] || fail "Missing/invalid $key in $dir/release.env"
  printf '%s\n' "$value"
}
require_same_infrastructure() {
  local from to key old_image new_image
  from="$(release_path "$1")"
  to="$(release_path "$2")"
  for key in POSTGRES_IMAGE MINIO_IMAGE MC_IMAGE; do
    old_image="$(release_value "$from" "$key")"
    new_image="$(release_value "$to" "$key")"
    [[ "$old_image" == "$new_image" ]] || fail "$key differs between releases; automatic infrastructure upgrades/downgrades are refused before containers change. Use a separately planned data-compatible infrastructure upgrade."
  done
}
verify_bundle() {
  local dir="$1" file digest entries=0
  [[ -f "$dir/SHA256SUMS" && ! -L "$dir/SHA256SUMS" ]] || fail 'Missing SHA256SUMS'
  while read -r digest file; do
    [[ "$digest" =~ ^[a-fA-F0-9]{64}$ && "$file" =~ ^[A-Za-z0-9_./-]+$ ]] || fail 'Invalid checksum entry'
    [[ "$file" != /* && "$file" != *..* ]] || fail 'Unsafe checksum path'
    [[ -f "$dir/$file" && ! -L "$dir/$file" ]] || fail "Missing checksum file: $file"
    [[ "$(readlink -f "$dir/$file")" == "$dir/$file" ]] || fail 'Checksum path traverses symlink'
    entries=$((entries + 1))
  done < "$dir/SHA256SUMS"
  (( entries > 0 )) || fail 'Empty SHA256SUMS'
  for file in compose.production.yaml release.env images.tar manifest.json dependency-audit.json scripts/server/deploy-bundle.sh scripts/server/release-common.sh scripts/server/export-legacy-env.mjs; do
    grep -Eq "^[a-fA-F0-9]{64}  $file$" "$dir/SHA256SUMS" || fail "Bundle checksum omits $file"
  done
  (cd "$dir" && sha256sum --check --strict SHA256SUMS) || fail 'Bundle checksum mismatch'
  [[ "$(release_value "$dir" RELEASE)" == "${dir##*/}" ]] || fail 'release.env RELEASE does not match release directory name'
}
compose_for() {
  local dir="$1"
  COMPOSE=(docker compose --project-name "$PROJECT" --project-directory "$dir"
    --env-file "$ROOT/server.env" --env-file "$dir/release.env" -f "$dir/compose.production.yaml")
  if [[ "$(uname -r)" == 3.10.* ]]; then
    # Generated only on the legacy kernel; never changes other services.
    printf 'services:\n  postgres:\n    security_opt:\n      - seccomp:unconfined\n' > "$dir/compose.centos7.yaml"
    COMPOSE+=(-f "$dir/compose.centos7.yaml")
    echo 'CentOS 7 kernel detected: PostgreSQL alone uses seccomp:unconfined.' >&2
  fi
}
dc() {
  # Shell environment must not silently replace saved Compose configuration.
  env -i PATH="$PATH" HOME="${HOME:-/root}" SERVER_ENV_FILE="$ROOT/server.env" \
    "${COMPOSE[@]}" "$@"
}
wait_postgres() {
  local attempt
  for ((attempt=0; attempt<60; attempt++)); do
    if dc exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  fail 'PostgreSQL did not become ready'
}
wait_minio() {
  local attempt container
  for ((attempt=0; attempt<60; attempt++)); do
    container="$(dc ps -q minio)"
    if [[ -n "$container" ]] && [[ "$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null)" == healthy ]]; then return 0; fi
    sleep 2
  done
  fail 'MinIO did not become ready'
}
wait_apps() {
  local attempt address
  for ((attempt=0; attempt<60; attempt++)); do
    address="$(dc port web 8080 2>/dev/null || true)"
    if [[ "$address" =~ ^127\.0\.0\.1:[0-9]+$ ]] &&
      dc exec -T api node -e 'fetch("http://127.0.0.1:4322/health/ready",{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1 &&
      curl --fail --silent --max-time 5 "http://$address/" >/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}
backup_database() {
  local backup="$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)-$$.sql"
  if [[ -L "$ROOT/backups" ]]; then echo 'Backup directory cannot be a symlink' >&2; return 1; fi
  mkdir -p "$ROOT/backups" || return 1
  chmod 700 "$ROOT/backups" || return 1
  if ! dc exec -T postgres sh -c 'pg_dump --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup"; then
    rm -f "$backup"
    echo 'Database backup failed; migration was not run' >&2
    return 1
  fi
  if [[ ! -s "$backup" ]]; then
    rm -f "$backup"
    echo 'Database backup is empty; migration was not run' >&2
    return 1
  fi
  chmod 600 "$backup" || return 1
  echo "Database backup: $backup"
}
