import { describe, expect, it } from 'vitest'
import type { DemoDemand, DemoProject } from '@/domain/prototype'
import { fresh } from './workflow-fixtures'
import {
  demandDistribution,
  demandMonthlyTrend,
  monthBounds,
  personWorkload,
  projectDistribution,
  projectIntersectsMonth,
  shiftMonth
} from './analytics-service'

const db = fresh().database
const owner = db.users.find((u) => u.role === 'engineer')!
const collaborator = db.users.find((u) => u.role === 'engineer' && u.id !== owner.id)!
const project = (overrides: Partial<DemoProject> = {}): DemoProject => ({
  ...db.projects[0],
  id: 'project-one',
  primaryOwnerId: owner.id,
  collaboratorIds: [collaborator.id],
  createdAt: '2026-08-20T10:00:00+08:00',
  expectedDeliveryDate: '2026-10-02',
  status: 'active',
  archived: false,
  simpleStatus: 'in-progress',
  risks: [],
  ...overrides
})
const demand = (overrides: Partial<DemoDemand> = {}): DemoDemand => ({
  ...db.demands[0],
  id: 'demand-one',
  department: '市场部',
  submittedAt: '2026-09-01T10:00:00+08:00',
  ...overrides
})

describe('管理图表的同源聚合', () => {
  it('跨月项目保留，两侧边界与闰月准确', () => {
    expect(projectIntersectsMonth(project(), '2026-09', '2026-09-08')).toBe(true)
    expect(
      projectIntersectsMonth(
        project({ createdAt: '2026-10-01T00:00:00+08:00' }),
        '2026-09',
        '2026-09-08'
      )
    ).toBe(false)
    expect(
      projectIntersectsMonth(
        project({ status: 'completed', expectedDeliveryDate: '2026-08-31' }),
        '2026-09',
        '2026-09-08'
      )
    ).toBe(false)
    expect(monthBounds('2028-02').end).toBe('2028-02-29')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(() => monthBounds('2026-13')).toThrow('月份')
  })
  it('延期仍在进行的项目继续占用当前月，已归档只计相交历史月', () => {
    const overdue = project({ expectedDeliveryDate: '2026-08-25' })
    expect(projectIntersectsMonth(overdue, '2026-09', '2026-09-08')).toBe(true)
    expect(projectIntersectsMonth({ ...overdue, archived: true }, '2026-09', '2026-09-08')).toBe(
      false
    )
    expect(
      projectIntersectsMonth({ ...overdue, status: 'cancelled' }, '2026-09', '2026-09-08')
    ).toBe(false)
  })
  it('显式含归档范围中已完成项目仍保留历史月份主责与协作负载', () => {
    const archived = project({
      status: 'completed',
      archived: true,
      expectedDeliveryDate: '2026-08-25'
    })
    const history = personWorkload([archived], db.users, '2026-08', '2026-09-08')
    expect(history.find((r) => r.user.id === owner.id)?.primary).toHaveLength(1)
    expect(history.find((r) => r.user.id === collaborator.id)?.collaboration).toHaveLength(1)
    expect(personWorkload([archived], db.users, '2026-09', '2026-09-08')).toHaveLength(0)
  })
  it('一项目仅计一名主责，重复协作和脏数据不产生重复数量', () => {
    const p = project({ collaboratorIds: [owner.id, collaborator.id, collaborator.id] })
    const rows = personWorkload(
      [p, p, project({ id: 'second' })],
      db.users,
      '2026-09',
      '2026-09-08'
    )
    expect(rows.find((r) => r.user.id === owner.id)?.primary).toHaveLength(2)
    expect(rows.find((r) => r.user.id === owner.id)?.collaboration).toHaveLength(0)
    expect(rows.find((r) => r.user.id === collaborator.id)?.primary).toHaveLength(0)
    expect(rows.find((r) => r.user.id === collaborator.id)?.collaboration).toHaveLength(2)
    expect(rows.reduce((sum, row) => sum + row.primary.length, 0)).toBe(2)
  })
  it('同期数按日期交集计算，不把本月全部项目当同期；阶段风险分别计数', () => {
    const first = project({
      expectedDeliveryDate: '2026-09-10',
      stage: '开发编码',
      risks: ['项目延期 2 天'],
      simpleStatus: 'blocked'
    })
    const second = project({
      id: 'second',
      createdAt: '2026-09-11T10:00:00+08:00',
      stage: '联调测试',
      risks: ['已有 3 个工作日未更新整体进度']
    })
    const row = personWorkload([first, second], db.users, '2026-09', '2026-09-08').find(
      (r) => r.user.id === owner.id
    )!
    expect(row.overlap).toBe(0)
    expect(row.stages).toEqual([
      { stage: '开发编码', count: 1 },
      { stage: '联调测试', count: 1 }
    ])
    expect([row.delayed.length, row.blocked.length, row.stale.length]).toEqual([1, 1, 1])
    expect(
      personWorkload(
        [first, { ...second, createdAt: '2026-09-10T10:00:00+08:00' }],
        db.users,
        '2026-09'
      )[0].overlap
    ).toBe(2)
  })
  it('分布指标只取传入范围，风险可交叉且不会累计为项目总数', () => {
    const buckets = projectDistribution([
      project({ risks: ['项目延期 1 天', '已有 3 个工作日未更新整体进度'] })
    ])
    expect(buckets.find((b) => b.key === 'active')?.projects).toHaveLength(1)
    expect(buckets.find((b) => b.key === 'delayed')?.projects).toHaveLength(1)
    expect(buckets.find((b) => b.key === 'stale')?.projects).toHaveLength(1)
    expect(projectDistribution([]).every((b) => !b.projects.length)).toBe(true)
  })
  it('部门/提出人数量和来源一致，月度补零并按上海日期分组', () => {
    const demands = [
      demand(),
      demand({ id: 'second', submittedAt: '2026-10-31T17:00:00Z', department: '财务部' }),
      demand({ id: 'draft', status: 'draft', submittedAt: '' })
    ]
    expect(
      demandDistribution(demands, db.users, 'department').reduce((n, g) => n + g.value, 0)
    ).toBe(3)
    expect(
      demandDistribution(demands, db.users, 'submitter').reduce((n, g) => n + g.demands.length, 0)
    ).toBe(3)
    expect(demandMonthlyTrend(demands, {from:"2026-09-01",to:"2026-11-30"})).toEqual({
      months: ['2026-09', '2026-10', '2026-11'],
      departments: [
        { name: '市场部', data: [1, 0, 0] },
        { name: '财务部', data: [0, 0, 1] }
      ]
    })
    expect(demandMonthlyTrend([], {}, new Date("2026-09-11"))).toEqual({ months: ["2026-04","2026-05","2026-06","2026-07","2026-08","2026-09"], departments: [] })
  })
})
