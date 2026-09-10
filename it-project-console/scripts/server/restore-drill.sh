#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=/opt/it-project-console
[[ "$(readlink -f "$ROOT")" == "$ROOT" && ! -L "$ROOT" ]]
DIR=$(readlink -f "$ROOT/current")
[[ "$DIR" == "$ROOT"/releases/* ]]
[[ ! -L "$ROOT/.release.lock" && ! -L "$ROOT/backups" ]]
exec 9>"$ROOT/.release.lock"
flock -n 9
RUN="$(date -u +%Y%m%d%H%M%S)-$$"
PROJECT="itpc-restore-$RUN"
[[ "$PROJECT" =~ ^itpc-restore-[0-9]+-[0-9]+$ ]]
BACKUP="$ROOT/backups/restore-$RUN"
mkdir -m 700 "$BACKUP"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cp "$SCRIPT_DIR/restore-fingerprint.sql" "$SCRIPT_DIR/restore-objects.mjs" "$BACKUP/"
export SERVER_ENV_FILE="$ROOT/server.env"
BASE=(docker compose --project-directory "$DIR" --env-file "$ROOT/server.env" --env-file "$DIR/release.env" -f "$DIR/compose.production.yaml" -f "$DIR/compose.centos7.yaml")
PROD=("${BASE[@]}" -p itpc-prod)
RESTORE=("${BASE[@]}" -p "$PROJECT")
IMAGE=$(docker inspect itpc-prod-api-1 --format '{{.Config.Image}}')
PAUSED=0
resume() {
 if [[ "$PAUSED" == 1 ]]; then
  docker start itpc-prod-minio-1 itpc-prod-api-1 itpc-prod-web-1 >/dev/null || return 1
  wait_healthy itpc-prod-minio-1 || return 1
  wait_healthy itpc-prod-api-1 || return 1
  wait_healthy itpc-prod-web-1 || return 1
  PAUSED=0
 fi
}
cleanup() {
 code=$?
 if ! resume; then code=1; echo 'PRODUCTION_RECOVERY_FAILED' >&2; fi
 if ! "${RESTORE[@]}" down -v --remove-orphans >/dev/null 2>&1; then code=1; echo "RESTORE_CLEANUP_FAILED=$PROJECT" >&2; fi
 if [[ -n "$(docker ps -aq --filter label=com.docker.compose.project="$PROJECT")" || -n "$(docker volume ls -q --filter label=com.docker.compose.project="$PROJECT")" ]]; then code=1; echo "RESTORE_RESOURCES_REMAIN=$PROJECT" >&2; fi
 if (( code == 0 )); then printf 'PASS\n' > "$BACKUP/RESULT"; fi
 echo "RESTORE_DRILL_EXIT=$code BACKUP=$BACKUP"
 exit "$code"
}
trap cleanup EXIT
wait_healthy() {
 for attempt in $(seq 1 60); do
  [[ "$(docker inspect "$1" --format '{{.State.Health.Status}}' 2>/dev/null)" == healthy ]] && return 0
  sleep 2
 done
 echo "Health check failed: $1" >&2; return 1
}
echo 'Pausing new-system writes for consistent backup'
PAUSED=1
docker stop itpc-prod-web-1 itpc-prod-api-1 >/dev/null
docker exec itpc-prod-postgres-1 pg_dump -U it_project_console -d it_project_console -Fc > "$BACKUP/database.dump"
docker exec -i itpc-prod-postgres-1 psql -X -qAt -v ON_ERROR_STOP=1 -U it_project_console -d it_project_console < "$BACKUP/restore-fingerprint.sql" > "$BACKUP/database-before.txt"
"${PROD[@]}" run --rm -T --no-deps api node --input-type=module < "$BACKUP/restore-objects.mjs" > "$BACKUP/objects-before.json"
docker stop itpc-prod-minio-1 >/dev/null
docker run --rm --network none -u 0 -v itpc-prod_minio-data:/data:ro -v "$BACKUP:/backup" "$IMAGE" sh -c 'cd /data && tar -czf /backup/minio-data.tar.gz .'
cp "$ROOT/server.env" "$BACKUP/server.env"
cp "$DIR/release.env" "$DIR/manifest.json" "$BACKUP/"
(cd "$BACKUP" && sha256sum database.dump minio-data.tar.gz server.env release.env manifest.json > SHA256SUMS)
resume
wait_healthy itpc-prod-minio-1
wait_healthy itpc-prod-api-1
wait_healthy itpc-prod-web-1
echo 'Online new system restored; validating independent recovery'
(cd "$BACKUP" && sha256sum -c SHA256SUMS)
"${RESTORE[@]}" up -d postgres
wait_healthy "$PROJECT-postgres-1"
docker exec -i "$PROJECT-postgres-1" pg_restore -U it_project_console -d it_project_console --clean --if-exists --exit-on-error < "$BACKUP/database.dump"
docker exec -i "$PROJECT-postgres-1" psql -X -qAt -v ON_ERROR_STOP=1 -U it_project_console -d it_project_console < "$BACKUP/restore-fingerprint.sql" > "$BACKUP/database-after.txt"
cmp "$BACKUP/database-before.txt" "$BACKUP/database-after.txt"
"${RESTORE[@]}" create minio
docker run --rm --network none -u 0 -v "${PROJECT}_minio-data:/data" -v "$BACKUP:/backup:ro" "$IMAGE" sh -c 'cd /data && tar -xzf /backup/minio-data.tar.gz'
"${RESTORE[@]}" start minio
wait_healthy "$PROJECT-minio-1"
"${RESTORE[@]}" run --rm -T --no-deps api node --input-type=module < "$BACKUP/restore-objects.mjs" > "$BACKUP/objects-after.json"
cmp "$BACKUP/objects-before.json" "$BACKUP/objects-after.json"
echo 'PASS: every public table row digest and every object byte digest match'
cat "$BACKUP/database-after.txt"
docker exec -i itpc-prod-api-1 node --input-type=module <<'NODE'
import {createPrisma} from '/app/dist/plugins/prisma.js'
const db=createPrisma(process.env.DATABASE_URL)
try{console.log(JSON.stringify({liveManagers:await db.managerGrant.count({where:{active:true}}),liveProjects:await db.project.count()}))}finally{await db.$disconnect()}
NODE
