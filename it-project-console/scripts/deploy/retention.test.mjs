import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm, access, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
test('发布包清理：锁、指针、PIN、待发布包和路径边界', () => {
  const result = spawnSync('docker', [
    'run', '--rm', '--network', 'none', '--entrypoint', 'bash',
    '--mount', `type=bind,source=${resolve(here, '../..')},target=/work,readonly`,
    'postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94',
    '/work/scripts/deploy/retention.test.sh', '/work'
  ], { encoding: 'utf8', windowsHide: true, timeout: 45000 })
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`)
})

test('本机清理仅删除明确版本，保护 PIN、链接及外部文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'itpc-local-retention-'))
  const runner = join(root, 'run.ps1')
  try {
    await writeFile(runner, `param([string]$Source,[string]$Root,[string]$Tag)\n. "$Source/common.ps1"\n. "$Source/retention.ps1"\nRemove-LocalRelease $Root $Tag\n`)
    const run = tag => spawnSync('pwsh', ['-NoProfile', '-File', runner, here, root, tag], { encoding: 'utf8', windowsHide: true })
    const releases = join(root, 'output/releases')
    for (const tag of ['old', 'keep', 'linked']) await mkdir(join(releases, tag), { recursive: true })
    await writeFile(join(releases, 'keep/PIN'), '')
    await mkdir(join(root, 'outside'))
    await writeFile(join(root, 'outside/preserve'), 'keep')
    await symlink(join(root, 'outside'), join(releases, 'linked/escape'), 'junction')
    assert.equal(run('old').status, 0)
    await assert.rejects(access(join(releases, 'old')))
    assert.equal(run('keep').status, 0)
    await access(join(releases, 'keep/PIN'))
    assert.notEqual(run('linked').status, 0)
    assert.notEqual(run('../outside').status, 0)
    await access(join(root, 'outside/preserve'))
    await access(join(releases, 'linked'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('发布收尾：部署失败不清理，清理部分失败保留成功结果并警告', async () => {
  const root = await mkdtemp(join(tmpdir(), 'itpc-retention-flow-'))
  try {
    await mkdir(join(root, 'output/releases/old'), { recursive: true })
    await mkdir(join(root, 'output/releases/keep'), { recursive: true })
    const runner = join(root, 'flow.ps1')
    await writeFile(runner, `param([string]$Source,[string]$Root)
. "$Source/common.ps1"
. "$Source/retention.ps1"
$script:calls = 0
function ssh { $script:calls++; $global:LASTEXITCODE = 1; 'REMOVED=old'; 'KEEP=keep' }
function Invoke-Checked { throw 'Deployment failed' }
try { Invoke-DeployAndRetain $Root fixture @() /opt/it-project-console keep deploy; throw 'Failure swallowed' }
catch { if ($_.Exception.Message -ne 'Deployment failed') { throw } }
if ($script:calls -ne 0) { throw 'Cleanup ran after failed deployment' }
function Invoke-Checked { }
Invoke-DeployAndRetain $Root fixture @() /opt/it-project-console keep deploy -WarningVariable cleanupWarning
if ($script:calls -ne 1 -or -not $cleanupWarning) { throw 'Cleanup failure was not warned' }
if (Test-Path -LiteralPath "$Root/output/releases/old") { throw 'Fully removed remote package not synced' }
if (-not (Test-Path -LiteralPath "$Root/output/releases/keep")) { throw 'Retained package deleted' }
`)
    const result = spawnSync('pwsh', ['-NoProfile', '-File', runner, here, root], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  } finally { await rm(root, { recursive: true, force: true }) }
})
