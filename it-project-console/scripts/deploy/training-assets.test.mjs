import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const assets = fileURLToPath(new URL('../../web/public/training', import.meta.url))
const config = fileURLToPath(new URL('../../deploy/nginx.conf', import.meta.url))
const files = [
  ['business-prd-prototype.zip', 30486, 'bae39d30ddcc2b3d2d34385ce914668ba1f0fa9489ad8e58de5693ebc7ed5a29'],
  ['business-prd-prototype-tutorial.mp4', 68581041, 'b87844c03d03ae30d216380b25043ae4e557ddfc9883a38f7c89ee5899ac54df']
]
const docker = args => spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 })

test('教程素材与用户提供的原文件大小及SHA256一致', async () => {
  for (const [name, size, hash] of files) {
    const bytes = await readFile(`${assets}/20260916/${name}`)
    assert.equal(bytes.length, size)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash)
  }
})

test('真实Nginx提供教程类型、分段播放和缺失文件404', async () => {
  const name = `itpc-training-test-${randomUUID()}`
  try {
    const started = docker(['run', '-d', '--name', name, '--network', 'none',
      '--add-host', 'api:127.0.0.1', '--add-host', 'minio:127.0.0.1',
      '--mount', `type=bind,source=${config},target=/etc/nginx/conf.d/default.conf,readonly`,
      '--mount', `type=bind,source=${assets},target=/usr/share/nginx/html/training,readonly`,
      'nginx:1.27-alpine'])
    assert.equal(started.status, 0, started.stderr)
    let ready = false
    for (let i = 0; i < 20; i++) {
      if (docker(['exec', name, 'wget', '-q', '-T', '2', '-O', '/dev/null', 'http://127.0.0.1:8080/']).status === 0) { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready)
    const request = (file, extra = []) => docker(['exec', name, 'curl', '--fail', '--silent', '--show-error', '--max-time', '5', '-D', '-', '-o', '/dev/null',
      ...extra, `http://127.0.0.1:8080/training/20260916/${file}`])
    const zip = request(files[0][0])
    assert.equal(zip.status, 0, zip.stderr)
    assert.match(zip.stdout, /Content-Type: application\/zip/i)
    assert.match(zip.stdout, /Content-Length: 30486/i)
    assert.match(zip.stdout, /Cache-Control: public, max-age=31536000, immutable/i)
    const video = request(files[1][0], ['--header', 'Range: bytes=0-1023'])
    assert.equal(video.status, 0, video.stderr)
    assert.match(video.stdout, /206 Partial Content/)
    assert.match(video.stdout, /Content-Type: video\/mp4/i)
    assert.match(video.stdout, /Content-Range: bytes 0-1023\/68581041/i)
    const missing = request('missing.zip')
    assert.notEqual(missing.status, 0)
    assert.match(missing.stdout, /404 Not Found/)
    assert.doesNotMatch(missing.stdout, /immutable/)
  } finally { docker(['rm', '-f', name]) }
})
