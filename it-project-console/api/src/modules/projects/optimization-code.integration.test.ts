import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { mapProject } from '../workspace/read-model.js'
import { dashboard } from '../dashboard/dashboard-service.js'
import { dashboardQuery } from '../dashboard/query-schemas.js'
import { notificationContent } from '../notifications/notification-service.js'

const env = parseEnv(process.env), database = new URL(env.DATABASE_URL)
if (env.NODE_ENV !== 'test' || !database.searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')) throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
afterAll(() => db.$disconnect())
const data = { name: '优化编号回归', primaryOwnerId: 'user-engineer-wang' }

describe('正式与优化独立编号', () => {
  it('并发独立年度序列、删除不复用、跨年、五位扩展、编号和类型不可修改', async () => {
    const createdAt = new Date('2187-12-31T16:00:00Z')
    const parent = await db.project.create({ data: { ...data, createdAt } })
    const rows = await Promise.all(Array.from({ length: 12 }, () => db.project.create({ data: { ...data, createdAt, parentProjectId: parent.id } })))
    expect(rows.map(p => p.code).sort()).toEqual(Array.from({ length: 12 }, (_, i) => `YH-2188-${String(i + 1).padStart(4, '0')}`))
    expect((await db.project.create({ data: { ...data, createdAt } })).code).toBe('XM-2188-0002')
    await db.project.delete({ where: { id: rows[0]!.id } })
    const next = await db.project.create({ data: { ...data, createdAt, parentProjectId: parent.id } })
    expect(next.code).toBe('YH-2188-0013')
    expect(next.legacyCode).toBeNull()
    for (const edit of [{ code: 'YH-2188-9999' }, { legacyCode: 'XM-2188-9999' }, { parentProjectId: null }]) {
      await expect(db.project.update({ where: { id: next.id }, data: edit })).rejects.toThrow()
    }
    await db.optimizationCodeCounter.update({ where: { year: 2188 }, data: { lastValue: 9999 } })
    expect((await db.project.create({ data: { ...data, createdAt, parentProjectId: parent.id } })).code).toBe('YH-2188-10000')
    expect((await db.project.create({ data: { ...data, createdAt: new Date('2187-12-31T15:59:59Z'), parentProjectId: parent.id } })).code).toBe('YH-2187-0001')
  })

  it('旧优化稳定迁移、保留审计/关联/高水位，重复执行与延迟 revision 兼容', async () => {
    const schema = `itpc_test_codes_${randomUUID().replaceAll('-', '')}`
    const url = new URL(env.DATABASE_URL); url.searchParams.delete('schema'); url.searchParams.delete('options')
    const client = new Client({ connectionString: url.toString() }); await client.connect()
    try {
      await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`)
      await client.query(`CREATE TABLE projects (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, parent_project_id TEXT REFERENCES projects(id));
        CREATE TABLE stage_histories (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), audit TEXT);
        INSERT INTO projects VALUES ('parent', '2026-01-01', NULL), ('b', '2026-01-02', 'parent'), ('a', '2026-01-02', 'parent');
        INSERT INTO stage_histories VALUES ('history', 'a', '原始审计 XM 不重写')`)
      const original = await readFile(new URL('../../../prisma/migrations/202609110002_project_codes_snapshots/migration.sql', import.meta.url), 'utf8')
      await client.query(original)
      await client.query('UPDATE project_code_counters SET last_value = 20')
      // Use the actual revision function with its production deferred trigger on projects.
      const revision = await readFile(new URL('../../../prisma/migrations/20260915100000_workspace_revision/migration.sql', import.meta.url), 'utf8')
      await client.query(revision.slice(0, revision.indexOf('DO $$')))
      await client.query('CREATE CONSTRAINT TRIGGER workspace_changed AFTER INSERT OR UPDATE OR DELETE ON projects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bump_workspace_revision()')
      const before = (await client.query('SELECT revision FROM workspace_revision')).rows[0].revision
      const sql = await readFile(new URL('../../../prisma/migrations/20260915110000_optimization_codes/migration.sql', import.meta.url), 'utf8')
      await client.query(sql)
      expect((await client.query('SELECT revision FROM workspace_revision')).rows[0].revision).not.toBe(before)
      const expected = [
        { id: 'a', code: 'YH-2026-0001', legacy_code: 'XM-2026-0002', parent_project_id: 'parent' },
        { id: 'b', code: 'YH-2026-0002', legacy_code: 'XM-2026-0003', parent_project_id: 'parent' },
        { id: 'parent', code: 'XM-2026-0001', legacy_code: null, parent_project_id: null }
      ]
      expect((await client.query('SELECT id, code, legacy_code, parent_project_id FROM projects ORDER BY id')).rows).toEqual(expected)
      await client.query(sql)
      expect((await client.query('SELECT id, code, legacy_code, parent_project_id FROM projects ORDER BY id')).rows).toEqual(expected)
      expect((await client.query('SELECT project_id, audit FROM stage_histories')).rows).toEqual([{ project_id: 'a', audit: '原始审计 XM 不重写' }])
      expect((await client.query("INSERT INTO projects (id, created_at) VALUES ('next', '2026-02-01') RETURNING code")).rows[0].code).toBe('XM-2026-0021')
      expect((await client.query("INSERT INTO projects (id, created_at, parent_project_id) VALUES ('next-yh', '2026-02-01', 'parent') RETURNING code")).rows[0].code).toBe('YH-2026-0003')
    } finally {
      await client.query('ROLLBACK'); await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await client.end()
    }
  })

  it('DTO与服务搜索新旧编号、统计拆分、通知只渲染优化文案', async () => {
    const parent = await db.project.create({ data })
    const project = await db.project.create({ data: { ...data, parentProjectId: parent.id }, include: { members: true, primaryOwner: true } })
    expect(mapProject(project)).toMatchObject({ code: project.code, legacyCode: null })
    const model = await db.$transaction(tx => dashboard(tx, dashboardQuery.parse({ keyword: project.code }), data.primaryOwnerId))
    expect(model.typeCounts).toEqual({ formal: 0, optimization: 1, total: 1 })
    // Migrated legacy fields are guarded at DB level; search the mapped legacy fixture through the same filter.
    const { filterProjects } = await import('../dashboard/dashboard-service.js')
    expect(filterProjects([{ ...mapProject(project), legacyCode: 'XM-2020-0011' }], [], dashboardQuery.parse({ keyword: 'XM-2020-0011' }), data.primaryOwnerId)).toHaveLength(1)
    const outbox = await db.notificationOutbox.create({ data: { recipientId: data.primaryOwnerId, projectId: project.id,
      eventType: 'DEMAND_APPROVED', idempotencyKey: randomUUID(), payload: {} }, include: { recipient: true, demand: true, deliveryLog: true } })
    for (const [eventType, title] of [['DEMAND_APPROVED', '项目优化已批准'], ['DEMAND_SUBMITTED', '项目优化待审批'], ['ACCEPTANCE_SUBMITTED', '项目优化待完成验收'], ['PROJECT_COMPLETED', '项目优化已完成']]) {
      const content = notificationContent({ ...outbox, eventType: eventType!, project }, env.WEB_ORIGIN)
      expect(content).toContain(title); expect(content).not.toContain('正式立项')
    }
  })
})
