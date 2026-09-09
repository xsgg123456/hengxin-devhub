import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const config = fileURLToPath(new URL('../../deploy/nginx.conf', import.meta.url))
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 })
test('真实 Nginx 成功与代理失败日志不包含 OAuth/S3 查询或 Referer', async () => {
  const name = `itpc-nginx-privacy-${randomUUID()}`
  const marker = `secret-fixture-${randomUUID()}`
  try {
    const started = docker(['run', '-d', '--name', name, '--network', 'none',
      '--add-host', 'api:127.0.0.1', '--add-host', 'minio:127.0.0.1',
      '--mount', `type=bind,source=${config},target=/etc/nginx/conf.d/default.conf,readonly`,
      'nginx:1.27-alpine'])
    assert.equal(started.status, 0, started.stderr)
    let ready = false
    for (let i = 0; i < 20; i++) {
      if (docker(['exec', name, 'wget', '-q', '-T', '2', '-O', '/dev/null', 'http://127.0.0.1:8080/']).status === 0) { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'Nginx did not start')
    for (const path of ['/?code=', '/api/auth/callback/dingtalk?code=', '/it-project-console/check?X-Amz-Signature=',
      '/health/ready?state=', '/assets/missing.js?code=']) {
      const response = docker(['exec', name, 'wget', '-q', '-T', '2', '-O', '/dev/null',
        '--header', `Referer: https://fixture.example/?state=${marker}`, `http://127.0.0.1:8080${path}${marker}`])
      assert.equal(response.status, path.startsWith('/?') ? 0 : 1)
    }
    const result = docker(['logs', name])
    assert.equal(result.status, 0)
    const logs = result.stdout + result.stderr
    assert.ok(logs.includes('/api/auth/callback/dingtalk'), 'Safe request path should remain observable')
    assert.ok(logs.includes('502'), 'Actual failed proxy request must be covered')
    assert.equal(logs.includes(marker), false, 'Sensitive query or Referer leaked into gateway logs')
  } finally { docker(['rm', '-f', name]) }
})
