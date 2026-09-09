import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const password = "fixture-$password'#\\value"
const url = new URL('postgresql://old-user@old-db/old-database')
url.password = password
const fixture = {
  DATABASE_URL: url.toString(), NEXTAUTH_URL: 'https://fixture.example:8443',
  S3_ACCESS_KEY: 'fixture-key', S3_SECRET_KEY: "fixture-s3-$secret'quote",
  DINGTALK_APP_KEY: 'fixture-app', DINGTALK_APP_SECRET: 'fixture-app-secret',
  DINGTALK_CORP_ID: 'fixture-corp', DINGTALK_AGENT_ID: '123',
  NEXTAUTH_SECRET: 'must-not-export-old-session-secret'
}
function exportConfig(env) {
  return spawnSync(process.execPath, [resolve(here, '../server/export-legacy-env.mjs')], {
    env, encoding: 'utf8', windowsHide: true
  })
}
test('Compose 两种配置读取方式均保留特殊字符，独立新库与桶', async () => {
  const result = exportConfig(fixture)
  assert.equal(result.status, 0, result.stderr)
  const root = await mkdtemp(join(tmpdir(), 'itpc-release-env-'))
  try {
  await writeFile(join(root, 'server.env'), result.stdout)
  await writeFile(join(root, 'compose.yaml'), 'services:\n  app:\n    image: fixture:unused\n    env_file: [server.env]\n  postgres:\n    image: fixture:unused\n    environment:\n      PASSWORD: ${POSTGRES_PASSWORD}\n      S3_SECRET: ${S3_SECRET_KEY}\n')
  const parsed = spawnSync('docker', ['compose', '--project-name', 'itpc-config-test', '--env-file', join(root, 'server.env'), '-f', join(root, 'compose.yaml'), 'config', '--format', 'json'], { encoding: 'utf8', windowsHide: true })
  assert.equal(parsed.status, 0, parsed.stderr)
  // `compose config` escapes literal dollars so its output can be used as Compose input again.
  const config = JSON.parse(parsed.stdout, (_key, value) => typeof value === 'string' ? value.replaceAll('$$', '$') : value)
  const env = config.services.app.environment
  assert.equal(env.POSTGRES_PASSWORD, password)
  assert.equal(env.S3_SECRET_KEY, fixture.S3_SECRET_KEY)
  assert.equal(config.services.postgres.environment.PASSWORD, password)
  assert.equal(config.services.postgres.environment.S3_SECRET, fixture.S3_SECRET_KEY)
  const database = new URL(env.DATABASE_URL)
  assert.equal(database.hostname, 'postgres')
  assert.equal(database.pathname, '/it_project_console')
  assert.equal(database.username, 'it_project_console')
  assert.equal(decodeURIComponent(database.password), password)
  assert.equal(env.S3_BUCKET, 'it-project-console')
  assert.equal(env.NEXTAUTH_URL, fixture.NEXTAUTH_URL)
  assert.equal(env.DINGTALK_APP_SECRET, fixture.DINGTALK_APP_SECRET)
  assert.equal(env.DINGTALK_NOTIFICATIONS_ENABLED, 'false')
  assert.equal(env.DEV_LOGIN, 'false')
  assert.equal(env.NEXTAUTH_SECRET, undefined)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('导出失败不输出半份密钥配置或错误中的实际秘密', () => {
  for (const override of [{ S3_SECRET_KEY: '' }, { NEXTAUTH_URL: 'http://fixture.example' }, { DINGTALK_APP_SECRET: 'bad\nvalue' }]) {
    const result = exportConfig({ ...fixture, ...override })
    assert.notEqual(result.status, 0)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr.includes(fixture.DINGTALK_APP_SECRET), false)
  }
})
test('产物审计拒绝环境文件、演示种子和开发者绝对路径', async () => {
  const root = await mkdtemp(join(tmpdir(), 'itpc-release-audit-'))
  try {
    await mkdir(join(root, 'web'))
    const run = () => spawnSync(process.execPath, [join(here, 'audit-payload.mjs'), root], { encoding: 'utf8', windowsHide: true })
    await writeFile(join(root, 'web/index.html'), '<main>Production</main>')
    assert.equal(run().status, 0)
    for (const [name, content] of [['.env', 'secret'], ['demo.js', '切换演示身份'], ['path.js', 'C:/Users/fixture/private']]) {
      const file = join(root, 'web', name)
      await writeFile(file, content)
      assert.notEqual(run().status, 0)
      await rm(file)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('失败发布重试遇到备份故障时不恢复旧 API', () => {
  const root = resolve(here, '../..')
  const result = spawnSync('docker', [
    'run', '--rm', '--network', 'none', '--entrypoint', 'bash',
    '--mount', `type=bind,source=${root},target=/work,readonly`,
    'postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94',
    '/work/scripts/deploy/pending-retry.test.sh', '/work'
  ], { encoding: 'utf8', windowsHide: true, timeout: 45000 })
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`)
})
