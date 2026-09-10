#!/usr/bin/env bash
# Consistent backup of this application only. Does not source credentials.
set -Eeuo pipefail
umask 077
ROOT=/opt/it-project-console
[[ "$(readlink -f "$ROOT")" == "$ROOT" && ! -L "$ROOT/.release.lock" && ! -L "$ROOT/.full-backup.lock" && ! -L "$ROOT/backups" ]] || exit 1
exec 9>"$ROOT/.release.lock"
flock -n 9 || { echo 'Another release/backup is running' >&2; exit 1; }
exec 8>"$ROOT/.full-backup.lock"
flock -n 8 || exit 1
BASE="$ROOT/backups/full"
[[ ! -L "$BASE" ]] || exit 1
mkdir -p "$BASE"
chmod 700 "$BASE"
DEST="$BASE/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir "$DEST"
API=itpc-prod-api-1
MINIO=itpc-prod-minio-1
PG=itpc-prod-postgres-1
for c in "$API" "$MINIO" "$PG"; do
 [[ "$(docker inspect -f '{{.State.Health.Status}}' "$c")" == healthy ]] || { echo "Unhealthy: $c" >&2; exit 1; }
done
image="$(docker inspect -f '{{.Image}}' "$PG")"
volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$MINIO")"
[[ "$volume" == itpc-prod_minio-data ]] || exit 1
stopped=0
wait_ready() {
 for ((i=0;i<60;i++)); do
  if curl -fsS --max-time 3 http://127.0.0.1:18080/health/ready >/dev/null 2>&1; then return 0; fi
  sleep 2
 done
 return 1
}
recover() {
 local result=$?
 if (( stopped )); then
  if docker start "$MINIO" "$API" >/dev/null && wait_ready; then echo 'SERVICES_RECOVERED'; else echo 'SERVICES_RECOVERY_FAILED' >&2; result=1; fi
 fi
 if (( result )); then echo "BACKUP_FAILED: $DEST" >&2; fi
 exit "$result"
}
trap recover EXIT
stopped=1
docker stop -t 30 "$API" >/dev/null
docker stop -t 30 "$MINIO" >/dev/null
docker exec "$PG" pg_dump -Fc --no-owner --no-acl -U it_project_console -d it_project_console > "$DEST/database.dump"
docker run --rm --network none --user 0 --entrypoint sh -v "$volume:/source:ro" -v "$DEST:/backup" "$image" -c 'tar -C /source -cpf /backup/minio.tar .'
cp "$ROOT/server.env" "$DEST/server.env"
readlink -f "$ROOT/current" > "$DEST/release.txt"
docker inspect -f '{{.Name}} {{.Image}}' "$API" "$MINIO" "$PG" itpc-prod-web-1 > "$DEST/images.txt"
[[ -s "$DEST/database.dump" && -s "$DEST/minio.tar" ]] || exit 1
(cd "$DEST" && sha256sum database.dump minio.tar server.env release.txt images.txt > SHA256SUMS)
docker start "$MINIO" "$API" >/dev/null
stopped=0
if wait_ready; then
  touch "$DEST/COMPLETE"
  echo "BACKUP_OK=$DEST"
  exit 0
fi
echo 'Backup saved but services failed readiness' >&2
exit 1
