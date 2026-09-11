import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'

const env = parseEnv(process.env)
const database = new URL(env.DATABASE_URL)
if (env.NODE_ENV !== 'test' || !database.searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
afterAll(() => db.$disconnect())
const data = { name: '编号事务验证', primaryOwnerId: 'user-engineer-wang' }

describe('项目编号数据库契约', () => {
  it('并发唯一、上海跨年、四位扩展、删除不复用、编辑不可改编号', async () => {
    const createdAt = new Date('2198-12-31T16:00:00Z')
    const rows = await Promise.all(Array.from({ length: 12 }, () => db.project.create({ data: { ...data, createdAt } })))
    expect(new Set(rows.map(row => row.code)).size).toBe(12)
    expect(rows.map(row => row.code).sort()).toEqual(Array.from({ length: 12 }, (_, i) => `XM-2199-${String(i + 1).padStart(4, '0')}`))
    await db.project.delete({ where: { id: rows[0]!.id } })
    const next = await db.project.create({ data: { ...data, createdAt } })
    expect(next.code).toBe('XM-2199-0013')
    expect((await db.project.update({ where: { id: next.id }, data: { name: '改名', createdAt: new Date() } })).code).toBe(next.code)
    await expect(db.project.update({ where: { id: next.id }, data: { code: 'XM-2199-9999' } })).rejects.toThrow()
    await db.projectCodeCounter.update({ where: { year: 2199 }, data: { lastValue: 9999 } })
    expect((await db.project.create({ data: { ...data, createdAt } })).code).toBe('XM-2199-10000')
    expect((await db.project.create({ data: { ...data, createdAt: new Date('2198-12-31T15:59:59Z') } })).code).toBe('XM-2198-0001')
  })

  it('迁移按createdAt/id稳定回填，重复执行不改编号且不拿当前计划伪造历史', async () => {
    const schema = `itpc_test_codes_${randomUUID().replaceAll('-', '')}`
    const url = new URL(env.DATABASE_URL)
    url.searchParams.delete('schema'); url.searchParams.delete('options')
    const client = new Client({ connectionString: url.toString() })
    await client.connect()
    try {
      await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`)
      await client.query(`CREATE TABLE projects (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL);
        CREATE TABLE stage_histories (id TEXT PRIMARY KEY, completed_at TIMESTAMPTZ, expected_date DATE);
        INSERT INTO projects VALUES ('b', '2025-12-31T16:00:00Z'), ('a', '2025-12-31T16:00:00Z'), ('c', '2025-12-31T15:59:59Z');
        INSERT INTO stage_histories VALUES ('legacy', '2026-01-15T00:00:00Z', '2026-01-13')`)
      const sql = await readFile(new URL('../../../prisma/migrations/202609110002_project_codes_snapshots/migration.sql', import.meta.url), 'utf8')
      await client.query(sql); await client.query(sql)
      expect((await client.query('SELECT id, code FROM projects ORDER BY id')).rows).toEqual([
        { id: 'a', code: 'XM-2026-0001' }, { id: 'b', code: 'XM-2026-0002' }, { id: 'c', code: 'XM-2025-0001' }
      ])
      expect((await client.query('SELECT planned_start_date, planned_end_date FROM stage_histories')).rows)
        .toEqual([{ planned_start_date: null, planned_end_date: null }])
      expect((await client.query("INSERT INTO projects (id, created_at) VALUES ('d', '2026-01-01') RETURNING code")).rows[0].code).toBe('XM-2026-0003')
    } finally {
      await client.query('ROLLBACK')
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await client.end()
    }
  })
})
