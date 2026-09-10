#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/opt/it-project-console
OPS="$ROOT/operations/go-live-20260909"
PROXY=itpd-prod-proxy-1
TEMPLATE=/opt/itpd/deploy/nginx.conf.template
MODE=${1:-check}
[[ "$MODE" == check || "$MODE" == switch || "$MODE" == rollback ]] || exit 1
[[ "$(readlink -f "$ROOT")" == "$ROOT" && ! -L "$ROOT/.release.lock" && ! -L "$OPS" && ! -L "$TEMPLATE" ]] || exit 1
exec 9>"$ROOT/.release.lock"
flock -n 9 || exit 1
[[ -f "$OPS/public.nginx.conf" ]]
if [[ "$MODE" == check ]]; then
 [[ -z "$(docker ps -aq -f name=^itpc-cutover-check$)" ]] || exit 1
 image=$(docker inspect -f '{{.Image}}' itpc-prod-web-1)
 cleanup_check() {
  local result=$?
  docker rm -f itpc-cutover-check >/dev/null 2>&1 || result=1
  if [[ -n "$(docker ps -aq -f name=^itpc-cutover-check$)" ]]; then result=1; fi
  if (( result != 0 )); then rm -f "$OPS/candidate-checked.sha256"; fi
  exit "$result"
 }
 trap cleanup_check EXIT
 docker run -d --name itpc-cutover-check --network itpc-prod_default --entrypoint nginx \
  -v "$OPS/public.nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v itpd-prod_tls_certs_prod:/etc/nginx/tls:ro "$image" -g 'daemon off;' >/dev/null
 docker exec itpc-cutover-check nginx -t
 # DNS and upstream readiness without exposing another public port.
 docker exec itpc-prod-api-1 node --input-type=module -e 'import https from "node:https"; const r=https.get({host:"itpc-cutover-check",port:443,path:"/health/ready",servername:"pmg.qhhengxin.top",headers:{Host:"pmg.qhhengxin.top:8443"}},res=>{res.resume();if(res.statusCode!==200)process.exitCode=1;else console.log("CANDIDATE_HTTPS_READY=200")});r.on("error",()=>process.exit(1));r.setTimeout(10000,()=>r.destroy());'
 docker exec itpc-prod-api-1 node --input-type=module -e 'import https from "node:https"; const r=https.request({host:"itpc-cutover-check",port:443,path:"/it-project-console/security-probe",method:"PUT",servername:"pmg.qhhengxin.top",headers:{Host:"pmg.qhhengxin.top:8443","X-Amz-Content-Sha256":"STREAMING-UNSIGNED-PAYLOAD-TRAILER"}},res=>{let s="";res.on("data",c=>s+=c);res.on("end",()=>{if(res.statusCode!==403||s!=="Unsupported upload encoding.\n")process.exitCode=1;else console.log("PUBLIC_STORAGE_GUARD=403")})});r.on("error",()=>process.exit(1));r.setTimeout(10000,()=>r.destroy());r.end();'
 docker rm -f itpc-cutover-check >/dev/null
 docker exec "$PROXY" cat /etc/nginx/conf.d/default.conf > "$OPS/rollback-candidate.conf"
 docker run -d --name itpc-cutover-check --network itpd-prod_default --entrypoint nginx \
  -v "$OPS/rollback-candidate.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v itpd-prod_tls_certs_prod:/etc/nginx/tls:ro "$image" -g 'daemon off;' >/dev/null
 docker network connect itpc-prod_default itpc-cutover-check
 docker exec itpc-cutover-check nginx -t
 docker exec itpc-prod-api-1 node --input-type=module -e 'import https from "node:https"; const r=https.get({host:"itpc-cutover-check",port:443,path:"/login",servername:"pmg.qhhengxin.top",headers:{Host:"pmg.qhhengxin.top:8443"}},res=>{let s="";res.on("data",c=>s+=c);res.on("end",()=>{if(res.statusCode!==200||!s.includes("/_next/"))process.exitCode=1;else console.log("ROLLBACK_CANDIDATE_OLD_APP=200")})});r.on("error",()=>process.exit(1));r.setTimeout(10000,()=>r.destroy());'
 sha256sum "$OPS/public.nginx.conf" > "$OPS/candidate-checked.sha256"
 exit 0
fi
if [[ "$MODE" == rollback ]]; then
 [[ -s "$OPS/old-template.conf" && -s "$OPS/old-effective.conf" ]] || exit 1
 cat "$OPS/old-template.conf" > "$TEMPLATE"
 docker exec -i "$PROXY" sh -c 'cat > /etc/nginx/conf.d/default.conf' < "$OPS/old-effective.conf"
 docker exec "$PROXY" nginx -t
 docker exec "$PROXY" nginx -s reload
 curl --fail --silent --show-error --retry 5 --retry-delay 1 --resolve pmg.qhhengxin.top:443:127.0.0.1 -H 'Host: pmg.qhhengxin.top:8443' https://pmg.qhhengxin.top/login > "$OPS/rollback-response.html"
 grep -q '/_next/' "$OPS/rollback-response.html"
 echo 'OLD_ROUTE_RESTORED; new database retained'
 exit 0
fi
# Bind the scoped release assessment to exact images; retain raw findings.
[[ -f "$OPS/image-gate.json" ]] || { echo 'Missing reviewed image scan gate' >&2; exit 1; }
docker inspect -f '{{.Image}}' itpc-prod-api-1 itpc-prod-web-1 itpc-prod-postgres-1 itpc-prod-minio-1 "$PROXY" > "$OPS/running-image-ids.txt"
docker exec -i itpc-prod-api-1 node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const g=JSON.parse(s);if(g.approved!==true||g.policy!=="functional-release-with-documented-limitations"||!Number.isInteger(g.critical)||g.critical<0||!Array.isArray(g.images)||g.images.length!==5||g.images.some(x=>!/^sha256:[a-f0-9]{64}$/.test(x))||typeof g.userDirection!=="string"||g.userDirection.length<20||!Array.isArray(g.limitations)||!g.limitations.length||!g.checks||["applicationRegression","runtimeMigration","backupRestore","storageProxy","rollbackCandidate"].some(k=>g.checks[k]!==true))process.exit(1)' < "$OPS/image-gate.json"
docker exec -i itpc-prod-api-1 node --input-type=module -e 'let s="";for await(const c of process.stdin)s+=c;const [g,ids]=s.split("\n---IDS---\n");if(JSON.stringify(JSON.parse(g).images)!==JSON.stringify(ids.trim().split("\n")))process.exit(1)' < <(cat "$OPS/image-gate.json"; printf '\n---IDS---\n'; cat "$OPS/running-image-ids.txt")
sha256sum -c "$OPS/candidate-checked.sha256"
curl -fsS http://127.0.0.1:18080/health/ready >/dev/null
[[ ! -e "$OPS/old-template.conf" && ! -e "$OPS/old-effective.conf" ]] || { echo 'Existing cutover state; inspect before retry' >&2; exit 1; }
cp "$TEMPLATE" "$OPS/old-template.conf"
docker exec "$PROXY" cat /etc/nginx/conf.d/default.conf > "$OPS/old-effective.conf"
docker network connect itpc-prod_default "$PROXY"
restore_on_error() {
 trap - ERR
 if cat "$OPS/old-template.conf" > "$TEMPLATE" &&
    docker exec -i "$PROXY" sh -c 'cat > /etc/nginx/conf.d/default.conf' < "$OPS/old-effective.conf" &&
    docker exec "$PROXY" nginx -t && docker exec "$PROXY" nginx -s reload &&
    curl --fail --silent --show-error --retry 5 --retry-delay 1 --resolve pmg.qhhengxin.top:443:127.0.0.1 -H 'Host: pmg.qhhengxin.top:8443' https://pmg.qhhengxin.top/login > "$OPS/rollback-response.html" &&
    grep -q '/_next/' "$OPS/rollback-response.html"; then
  echo 'Switch failed; old route restored and verified' >&2
 else
  echo 'Switch failed; automatic route recovery FAILED; manual recovery required' >&2
 fi
 exit 1
}
trap restore_on_error ERR
cat "$OPS/public.nginx.conf" > "$TEMPLATE"
docker exec -i "$PROXY" sh -c 'cat > /etc/nginx/conf.d/default.conf' < "$OPS/public.nginx.conf"
docker exec "$PROXY" nginx -t
docker exec "$PROXY" nginx -s reload
curl --fail --silent --show-error --retry 5 --retry-delay 1 --resolve pmg.qhhengxin.top:443:127.0.0.1 -H 'Host: pmg.qhhengxin.top:8443' https://pmg.qhhengxin.top/health/ready >/dev/null
trap - ERR
echo 'PUBLIC_ROUTE_SWITCHED'
