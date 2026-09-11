import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { mapDemand } from '../workspace/read-model.js'

const env = parseEnv(process.env)
const database = new URL(env.DATABASE_URL)
if (env.NODE_ENV !== 'test' || !database.searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
afterAll(() => db.$disconnect())
const data = { name: '编号事务验证', ownerId: 'user-engineer-wang' }

describe('需求编号数据库契约', () => {
  it('并发唯一、上海跨年、四位扩展、删除不复用、编辑不可改编号', async () => {
    const createdAt = new Date('2198-12-31T16:00:00Z')
    const rows = await Promise.all(Array.from({ length: 12 }, () => db.demand.create({ data: { ...data, createdAt } })))
    expect(new Set(rows.map(row => row.code)).size).toBe(12)
    expect(rows.map(row => row.code).sort()).toEqual(Array.from({ length: 12 }, (_, i) => `XQ-2199-${String(i + 1).padStart(4, '0')}`))
    await db.demand.delete({ where: { id: rows[0]!.id } })
    const next = await db.demand.create({ data: { ...data, createdAt } })
    expect(next.code).toBe('XQ-2199-0013')
    expect(next.status).toBe('DRAFT')
    expect(mapDemand({ ...next, attachments: [] })).toMatchObject({ id: next.id, code: next.code, createdAt: createdAt.toISOString() })
    expect((await db.demand.update({ where: { id: next.id }, data: { name: '改名', createdAt: new Date() } })).code).toBe(next.code)
    expect((await db.demand.update({ where: { id: next.id }, data: { status: 'PENDING' } })).code).toBe(next.code)
    const project = await db.project.create({ data: { name: '需求立项编号保持', primaryOwnerId: data.ownerId, demandId: next.id } })
    expect((await db.demand.update({ where: { id: next.id }, data: { status: 'APPROVED' } })).code).toBe(next.code)
    expect(project.demandId).toBe(next.id)
    await expect(db.demand.update({ where: { id: next.id }, data: { code: 'XQ-2199-9999' } })).rejects.toThrow()
    await db.demandCodeCounter.update({ where: { year: 2199 }, data: { lastValue: 9999 } })
    expect((await db.demand.create({ data: { ...data, createdAt } })).code).toBe('XQ-2199-10000')
    expect((await db.demand.create({ data: { ...data, createdAt: new Date('2198-12-31T15:59:59Z') } })).code).toBe('XQ-2198-0001')
  })

  it('迁移按createdAt/id稳定回填，重复执行不改编号并保留删除后的计数器', async () => {
    const schema = `itpc_test_codes_${randomUUID().replaceAll('-', '')}`
    const url = new URL(env.DATABASE_URL)
    url.searchParams.delete('schema'); url.searchParams.delete('options')
    const client = new Client({ connectionString: url.toString() })
    await client.connect()
    try {
      await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`)
      await client.query(`CREATE TABLE demands (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL);
        INSERT INTO demands VALUES ('b', '2025-12-31T16:00:00Z'), ('a', '2025-12-31T16:00:00Z'), ('c', '2025-12-31T15:59:59Z')`)
      const sql = await readFile(new URL('../../../prisma/migrations/202609110004_demand_codes/migration.sql', import.meta.url), 'utf8')
      await client.query(sql); await client.query(sql)
      expect((await client.query('SELECT id, code FROM demands ORDER BY id')).rows).toEqual([
        { id: 'a', code: 'XQ-2026-0001' }, { id: 'b', code: 'XQ-2026-0002' }, { id: 'c', code: 'XQ-2025-0001' }
      ])
      expect((await client.query("INSERT INTO demands (id, created_at) VALUES ('d', '2026-01-01') RETURNING code")).rows[0].code).toBe('XQ-2026-0003')
      await client.query("DELETE FROM demands WHERE id = 'd'")
      await client.query(sql)
      expect((await client.query("INSERT INTO demands (id, created_at, code) VALUES ('e', '2026-01-01', '外部指定编号') RETURNING code")).rows[0].code).toBe('XQ-2026-0004')
    } finally {
      await client.query('ROLLBACK')
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await client.end()
    }
  })
})
