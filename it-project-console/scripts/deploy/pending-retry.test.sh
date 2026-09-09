#!/usr/bin/env bash
# Run: bash scripts/deploy/pending-retry.test.sh [repository-or-product-root]
# Docker is stubbed: no daemon/socket or business containers are used.
set -euo pipefail
PRODUCT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
if [[ -d "$PRODUCT/it-project-console/scripts/server" ]]; then PRODUCT="$PRODUCT/it-project-console"; fi
[[ -f "$PRODUCT/scripts/server/deploy-bundle.sh" ]] || { echo 'Missing product source' >&2; exit 1; }
WORK="$(mktemp -d /tmp/itpc-release-test-pending-gate.XXXXXX)"
[[ "$WORK" == /tmp/itpc-release-test-pending-gate.* && "$(readlink -f "$WORK")" == "$WORK" ]] || exit 1
trap 'rm -rf -- "$WORK"' EXIT

fixture() {
  local root="$1" variant="$2" tag dir content guard replacement
  mkdir -p "$root/releases" "$root/bin"
  for tag in A B; do
    dir="$root/releases/$tag"
    mkdir -p "$dir/scripts/server"
    cp "$PRODUCT/scripts/server/"{deploy-bundle.sh,release-common.sh,export-legacy-env.mjs} "$dir/scripts/server/"
    if [[ "$variant" == mutant ]]; then
      guard='if [[ -n "$CURRENT" && -z "$PENDING" ]]; then'
      replacement='if [[ -n "$CURRENT" ]]; then'
      content="$(cat "$dir/scripts/server/deploy-bundle.sh")"
      [[ "$content" == *"$guard"* ]] || { echo 'Mutation guard not found' >&2; return 1; }
      printf '%s\n' "${content//"$guard"/"$replacement"}" > "$dir/scripts/server/deploy-bundle.sh"
    fi
    {
      printf 'RELEASE=%s\n' "$tag"
      printf 'MIGRATION_HASH=%s\n' "$(printf '%s' "$tag" | sha256sum | cut -d ' ' -f1)"
      printf 'POSTGRES_IMAGE=itpc-postgres:stable\nMINIO_IMAGE=itpc-minio:stable\nMC_IMAGE=itpc-mc:stable\n'
      printf 'API_IMAGE=itpc-api:%s\nWEB_IMAGE=itpc-web:%s\nDEPENDENCY_AUDIT_HIGH=0\nDEPENDENCY_AUDIT_CRITICAL=0\n' "$tag" "$tag"
    } > "$dir/release.env"
    printf 'services: {}\n' > "$dir/compose.production.yaml"
    printf 'dummy image archive; fake docker never opens it\n' > "$dir/images.tar"
    printf '{}\n' | tee "$dir/manifest.json" > "$dir/dependency-audit.json"
    (cd "$dir" && sha256sum compose.production.yaml release.env images.tar manifest.json dependency-audit.json \
      scripts/server/deploy-bundle.sh scripts/server/release-common.sh scripts/server/export-legacy-env.mjs > SHA256SUMS)
  done
  printf 'TEST_FIXTURE=true\n' > "$root/server.env"
  chmod 600 "$root/server.env"
  ln -s releases/A "$root/current"
  ln -s releases/B "$root/pending"
  # Real mkdir fails here, before pg_dump. A prior pending migration may have changed the DB.
  printf 'deliberate backup directory collision\n' > "$root/backups"
  cat > "$root/bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
trace="$(cd "$(dirname "$0")/.." && pwd)/trace"
case "${1:-}" in
  load) echo 'load' >> "$trace"; exit 0 ;;
  inspect) echo 'inspect' >> "$trace"; echo healthy; exit 0 ;;
  compose) shift ;;
  *) echo "Unexpected fake Docker command: $*" >&2; exit 90 ;;
esac
while [[ "${1:-}" == --* || "${1:-}" == -f ]]; do
  case "$1" in --project-name|--project-directory|--env-file|-f) shift 2 ;; *) exit 91 ;; esac
done
printf '%s\n' "$*" >> "$trace"
case "${1:-}" in
  version|config|up|stop|run|exec) exit 0 ;;
  ps) echo fixture-minio; exit 0 ;;
  port) echo 127.0.0.1:18080; exit 0 ;;
  *) exit 92 ;;
esac
FAKE_DOCKER
  printf '#!/usr/bin/env bash\nexit 0\n' > "$root/bin/curl"
  chmod +x "$root/bin/docker" "$root/bin/curl"
}

check_retry() {
  local root="$1" result=0
  PATH="$root/bin:$PATH" ITPC_COMPOSE_PROJECT=itpc-test-release-pending-gate \
    bash "$root/releases/B/scripts/server/deploy-bundle.sh" deploy "$root" B > "$root/output" 2>&1 || result=$?
  [[ "$result" -ne 0 ]] || { echo 'FAIL: backup collision was accepted' >&2; return 1; }
  [[ "$(readlink "$root/current")" == releases/A && "$(readlink "$root/pending")" == releases/B ]] || return 2
  grep -q '^stop api web$' "$root/trace" || { cat "$root/output" >&2; return 3; }
  grep -q 'mkdir:' "$root/output" || return 4
  if grep -Eq '^up .*api web$' "$root/trace"; then
    echo 'Detected unsafe application restart after pending retry backup failure.'
    return 42
  fi
  if grep -Eq '^run .* migrate$' "$root/trace"; then return 5; fi
  echo "PASS: exit=$result; current=A; pending=B; stop api/web observed; no application restart or migration."
}

fixture "$WORK/fixed" fixed
check_retry "$WORK/fixed"
fixture "$WORK/mutant" mutant
mutation_result=0
check_retry "$WORK/mutant" || mutation_result=$?
[[ "$mutation_result" == 42 ]] || { echo "FAIL: mutation did not trigger the restart assertion (exit=$mutation_result)" >&2; exit 1; }
echo 'PASS: temporary old-guard mutation was rejected by the same behavioral regression assertion.'
