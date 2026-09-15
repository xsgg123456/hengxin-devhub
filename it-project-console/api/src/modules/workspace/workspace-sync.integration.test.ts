import { createHash, randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { workspaceRevision } from './workspace-sync.js'

const env = parseEnv(process.env)
const url = new URL(env.DATABASE_URL)
const schema = url.searchParams.get('schema') ?? ''
if (env.NODE_ENV !== 'test' || !/^itpc_test_[a-f0-9]+$/.test(schema) || !['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('必须由本机隔离集成测试入口运行')
url.searchParams.delete('schema')
url.searchParams.set('options', `-c search_path=${schema}`)
const db = createPrisma(env.DATABASE_URL)
const apps: Awaited<ReturnType<typeof buildApp>>['app'][] = []
const addresses: string[] = []
const userId = `sync-${randomBytes(6).toString('hex')}`
let token: string
let tokenHash: string
beforeAll(async () => {
  await db.user.create({ data: { id: userId, name: '同步测试', department: '测试', role: 'MANAGER' } })
  token = randomBytes(32).toString('hex')
  tokenHash = createHash('sha256').update(token).digest('hex')
  await db.session.create({ data: { tokenHash, userId, expiresAt: new Date(Date.now() + 60000) } })
  for (let index = 0; index < 2; index++) {
    const { app } = await buildApp(env, { logging: false })
    apps.push(app)
    addresses.push(await app.listen({ host: '127.0.0.1', port: 0 }))
  }
})
afterAll(async () => {
  await Promise.all(apps.map(app => app.close()))
  await db.session.deleteMany({ where: { userId } })
  await db.user.delete({ where: { id: userId } })
  await db.$disconnect()
})

it('has deferred coverage for all workspace and risk/permission source tables', async () => {
  const rows = await db.$queryRaw<Array<{ table_name: string; deferred: boolean }>>`
    SELECT c.relname AS table_name, t.tgdeferrable AND t.tginitdeferred AS deferred
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND t.tgname = 'workspace_changed'`
  expect(rows.every(row => row.deferred)).toBe(true)
  expect(rows.map(row => row.table_name).sort()).toEqual([
    'users', 'departments', 'manager_grants', 'demands', 'projects', 'project_proposals',
    'project_members', 'attachments', 'stage_histories', 'progress_updates',
    'schedule_changes', 'lifecycle_events', 'risk_snapshots', 'system_settings'
  ].sort())
})

it('keeps uncommitted/rolled-back writes invisible and serializes concurrent commits', async () => {
  const first = new Client({ connectionString: url.toString() })
  const second = new Client({ connectionString: url.toString() })
  await Promise.all([first.connect(), second.connect()])
  const before = await workspaceRevision(db)
  try {
    await first.query('BEGIN')
    await first.query('UPDATE users SET name = name WHERE id = $1', [userId])
    expect(await workspaceRevision(db)).toBe(before)
    await first.query('ROLLBACK')
    expect(await workspaceRevision(db)).toBe(before)
    await first.query('BEGIN')
    await first.query('UPDATE users SET name = name WHERE id = $1', [userId])
    await first.query('SET CONSTRAINTS ALL IMMEDIATE')
    expect(await workspaceRevision(db)).toBe(before)
    await first.query('ROLLBACK')
    expect(await workspaceRevision(db)).toBe(before)
    await Promise.all([first.query('BEGIN'), second.query('BEGIN')])
    await first.query('UPDATE users SET name = name WHERE id = $1', [userId])
    await second.query("INSERT INTO departments (id, name, updated_at) VALUES ('sync-dept', '同步', now())")
    expect(await workspaceRevision(db)).toBe(before)
    await Promise.all([first.query('COMMIT'), second.query('COMMIT')])
    const after = await workspaceRevision(db)
    expect(after).not.toBe(before)
    expect(await workspaceRevision(db)).toBe(after)
    await db.department.delete({ where: { id: 'sync-dept' } })
    expect(await workspaceRevision(db)).not.toBe(after)
  } finally { await Promise.all([first.end(), second.end()]) }
})

async function stream(index: number) {
  const controller = new AbortController()
  const response = await fetch(`${addresses[index]}/api/workspace/events`, {
    headers: { cookie: `itpc_session=${token}` }, signal: controller.signal
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('x-accel-buffering')).toBe('no')
  const reader = response.body!.getReader()
  let buffer = ''
  const next = async () => {
    const timeout = setTimeout(() => controller.abort(), 6000)
    try {
      while (!buffer.includes('\n\n')) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error('stream closed before event')
        buffer += new TextDecoder().decode(chunk.value)
      }
      const boundary = buffer.indexOf('\n\n')
      const event = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      return event
    } finally { clearTimeout(timeout) }
  }
  return { next, ended: async () => (await reader.read()).done, close: () => controller.abort() }
}

it('authenticates both endpoints and broadcasts only committed opaque revisions across instances', async () => {
  for (const path of ['revision', 'events']) expect((await apps[0]!.inject(`/api/workspace/${path}`)).statusCode).toBe(401)
  const streams = await Promise.all([stream(0), stream(1)])
  try {
    const initial = await workspaceRevision(db)
    for (const connection of streams) expect(await connection.next()).toBe(`retry: 2000\nevent: change\ndata: {"revision":"${initial}"}`)
    await db.user.update({ where: { id: userId }, data: { role: 'BUSINESS' } })
    const committed = await workspaceRevision(db)
    for (const connection of streams) expect(await connection.next()).toBe(`event: change\ndata: {"revision":"${committed}"}`)
    const check = await apps[1]!.inject({ url: '/api/workspace/revision', headers: { cookie: `itpc_session=${token}` } })
    expect(check.json()).toEqual({ data: { revision: committed } })
    expect((await apps[0]!.inject({ url: '/api/admin/settings', headers: { cookie: `itpc_session=${token}` } })).statusCode).toBe(403)
    await db.session.delete({ where: { tokenHash } })
    for (const connection of streams) expect(await connection.next()).toBe('event: session-expired\ndata: {}')
    expect((await apps[0]!.inject({ url: '/api/workspace/revision', headers: { cookie: `itpc_session=${token}` } })).statusCode).toBe(401)
  } finally { streams.forEach(connection => connection.close()) }
}, 15000)

it('reconnects with latest revision then closes when account becomes inactive', async () => {
  const before = await workspaceRevision(db)
  await db.session.create({ data: { tokenHash, userId, expiresAt: new Date(Date.now() + 60000) } })
  expect(await workspaceRevision(db)).toBe(before)
  const connection = await stream(0)
  try {
    expect(await connection.next()).toContain(await workspaceRevision(db))
    await db.user.update({ where: { id: userId }, data: { active: false } })
    expect(await connection.next()).toBe('event: session-expired\ndata: {}')
  } finally { connection.close() }
})

it('closes active streams before Fastify drains connections on shutdown', async () => {
  await db.user.update({ where: { id: userId }, data: { active: true } })
  const connection = await stream(1)
  try {
    await connection.next()
    await apps[1]!.close()
    expect(await connection.ended()).toBe(true)
  } finally { connection.close() }
})
