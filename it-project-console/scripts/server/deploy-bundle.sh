#!/usr/bin/env bash
set -euo pipefail
umask 077
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/release-common.sh"

ACTION="${1:-}"
ROOT="${2:-/opt/it-project-console}"
TAG="${3:-}"
[[ $# -le 4 && "$ACTION" =~ ^(deploy|status|rollback|init-config)$ ]] || fail 'Usage: deploy-bundle.sh <deploy|status|rollback|init-config> [absolute-root] [release-tag] [bootstrap-admin-id]'
[[ $# -le 3 || "$ACTION" == init-config ]] || fail 'Fourth argument is only accepted for init-config'
[[ "$ROOT" =~ ^/[A-Za-z0-9_./-]+$ && "$ROOT" != *..* && "$ROOT" != */ ]] || fail 'Root must be an absolute safe path without whitespace or trailing slash'
[[ "$ROOT" == /opt/it-project-console || "$ROOT" == /tmp/itpc-release-test-* ]] || fail 'Root must be /opt/it-project-console or /tmp/itpc-release-test-*'
[[ -d "$ROOT" && ! -L "$ROOT" && "$(readlink -f "$ROOT")" == "$ROOT" ]] || fail 'Root must exist and cannot traverse symlinks'
[[ ! -L "$ROOT/releases" && -d "$ROOT/releases" ]] || fail 'Missing/unsafe releases directory'
PROJECT="${ITPC_COMPOSE_PROJECT:-itpc-prod}"
[[ "$PROJECT" == itpc-prod || "$PROJECT" =~ ^itpc-test-release-[a-z0-9][a-z0-9-]{0,48}$ ]] || fail 'Invalid isolated Compose project name'
for command in docker flock curl sha256sum readlink stat; do command -v "$command" >/dev/null || fail "Missing command: $command"; done
[[ ! -L "$ROOT/.release.lock" ]] || fail 'Unsafe lock path'
exec 9>"$ROOT/.release.lock"
flock -n 9 || fail 'Another release operation is active'
if [[ "$ACTION" == init-config ]]; then
  [[ ! -e "$ROOT/server.env" && ! -L "$ROOT/server.env" ]] || fail 'server.env already exists; refusing to overwrite it'
  ADMIN_ID="${4:-}"
  [[ -z "$ADMIN_ID" || "$ADMIN_ID" =~ ^[A-Za-z0-9_.@-]{1,128}$ ]] || fail 'Invalid bootstrap admin DingTalk user ID'
  DIR="$(release_path "$TAG")"
  verify_bundle "$DIR"
  TEMP_ENV="$(mktemp "$ROOT/.server.env.XXXXXX")"
  trap 'rm -f "$TEMP_ENV"' EXIT
  if ! docker exec -i -e "BOOTSTRAP_ADMIN_DING_USER_ID=$ADMIN_ID" itpd-prod-app-1 node \
    < "$DIR/scripts/server/export-legacy-env.mjs" > "$TEMP_ENV"; then
    fail 'Configuration export failed; server.env was not created'
  fi
  [[ -s "$TEMP_ENV" ]] || fail 'Configuration export was empty'
  chmod 600 "$TEMP_ENV"
  mv -T "$TEMP_ENV" "$ROOT/server.env"
  trap - EXIT
  echo 'Initialized isolated server.env (mode 0600); existing source configuration was read only.'
  exit 0
fi
[[ -f "$ROOT/server.env" && ! -L "$ROOT/server.env" ]] || fail 'Missing server.env: run Initialize first; deployment never overwrites production env'
ENV_MODE="$(stat -c '%a' "$ROOT/server.env")"
[[ "$ENV_MODE" == 600 || "$ENV_MODE" == 400 ]] || fail 'server.env must have mode 0600 or 0400; restrict its permissions before reading secrets'
docker compose version >/dev/null
CURRENT="$(link_tag current)"
PREVIOUS="$(link_tag previous)"
PENDING="$(link_tag pending)"

if [[ "$ACTION" == status ]]; then
  printf 'project=%s\ncurrent=%s\nprevious=%s\npending=%s\n' "$PROJECT" "$CURRENT" "$PREVIOUS" "$PENDING"
  ACTIVE="${PENDING:-${CURRENT:-$TAG}}"
  [[ -n "$ACTIVE" ]] || exit 0
  compose_for "$(release_path "$ACTIVE")"
  dc ps --all
  exit 0
fi

if [[ "$ACTION" == rollback ]]; then
  # Failed deployment: restore current. Normal rollback: restore previous.
  TARGET="${PREVIOUS:-}"
  FROM="$CURRENT"
  if [[ -n "$PENDING" ]]; then TARGET="$CURRENT"; FROM="$PENDING"; fi
  [[ -n "$TARGET" && -n "$FROM" ]] || fail 'No previous successful release available for rollback'
  [[ "$(migration_hash "$TARGET")" == "$(migration_hash "$FROM")" ]] || fail 'Migration hashes differ: image-only rollback is unsafe. Restore an appropriate database backup with an operator; database is NOT automatically rolled back.'
  DIR="$(release_path "$TARGET")"
  verify_bundle "$DIR"
  require_same_infrastructure "$FROM" "$TARGET"
  if [[ -n "$CURRENT" ]]; then require_same_infrastructure "$CURRENT" "$TARGET"; fi
  compose_for "$DIR"
  dc config --quiet
  docker load -i "$DIR/images.tar"
  if ! dc up -d --no-deps --force-recreate api web; then
    dc stop api web || true
    fail 'Rollback startup failed; current pointers preserved'
  fi
  if ! wait_apps; then
    dc stop api web
    fail 'Rollback application health failed; applications stopped; current pointers preserved'
  fi
  if [[ -z "$PENDING" ]]; then atomic_link previous "$CURRENT"; fi
  atomic_link current "$TARGET"
  rm -f "$ROOT/pending"
  echo "Rollback healthy: $TARGET"
  exit 0
fi

valid_tag "$TAG" || fail 'deploy requires a valid release tag'
[[ "$TAG" != "$CURRENT" ]] || fail 'Release is already current; use a new immutable release tag'
[[ -z "$PENDING" || "$PENDING" == "$TAG" ]] || fail "Unresolved deployment $PENDING: retry that release or resolve rollback before another deployment"
DIR="$(release_path "$TAG")"
verify_bundle "$DIR"
migration_hash "$TAG" >/dev/null
if [[ "$ROOT" == /opt/it-project-console ]]; then
  [[ "$(release_value "$DIR" DEPENDENCY_AUDIT_HIGH)" == 0 && "$(release_value "$DIR" DEPENDENCY_AUDIT_CRITICAL)" == 0 ]] || fail 'Production deployment blocked by high/critical dependency findings; resolve findings and build a new package. No running containers were changed.'
fi
if [[ -n "$CURRENT" ]]; then require_same_infrastructure "$CURRENT" "$TAG"; fi
compose_for "$DIR"
dc config --quiet
docker load -i "$DIR/images.tar"
dc up -d postgres minio
wait_postgres
wait_minio
dc run --rm --no-deps minio-init
# Stop existing writers before backup/migration, including a retry after failure.
dc stop api web
if ! backup_database; then
  # Only a first attempt is known to precede migration. A pending retry may have already changed the DB.
  if [[ -n "$CURRENT" && -z "$PENDING" ]]; then
    compose_for "$(release_path "$CURRENT")"
    if dc up -d --no-deps api web && wait_apps; then
      fail 'Backup failed; migration was not run and current applications were restored healthy.'
    fi
    dc stop api web || true
  fi
  if [[ -n "$PENDING" ]]; then
    fail 'Backup failed during a pending retry; earlier migration state is unknown. Applications remain stopped and pending is preserved; inspect database state before retrying.'
  fi
  fail 'Backup failed; migration was not run. Applications are stopped; fix backup storage/permissions and retry the requested release.'
fi
if [[ -n "$CURRENT" ]]; then atomic_link previous "$CURRENT"; fi
atomic_link pending "$TAG"
if ! dc run --rm --no-deps migrate; then
  fail 'Migration failed; API/web remain stopped. Database is NOT automatically rolled back. Inspect migration output and backups before retrying.'
fi
if ! dc up -d --no-deps --force-recreate api web; then
  dc stop api web || true
  fail 'Application startup failed after migration. Database is NOT automatically rolled back; pending release retained.'
fi
if ! wait_apps; then
  dc stop api web
  fail 'Application health failed after migration; API/web stopped. Database is NOT automatically rolled back; pending release retained.'
fi
atomic_link current "$TAG"
rm -f "$ROOT/pending"
if [[ ! -L "$DIR/.deployed" ]] && touch "$DIR/.deployed"; then
  rm -f "$ROOT/incoming/.uploading-$TAG" || echo 'WARNING: upload protection could not be removed; package retained.' >&2
else
  echo 'WARNING: success marker could not be written; package cleanup requires attention.' >&2
fi
echo "Deployment healthy: $TAG (project=$PROJECT)"
