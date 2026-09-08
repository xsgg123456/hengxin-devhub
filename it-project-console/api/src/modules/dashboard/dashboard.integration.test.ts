import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import type { dashboard } from './dashboard-service.js'
import type { personWorkload } from '../workload/workload-service.js'
import type { buildGanttRows } from '../gantt/gantt-service.js'
import type { demandStatistics } from './demand-statistics-service.js'
import { businessDate } from '../calendar/workday.js'
const env = parseEnv(process.env)
if (
  env.NODE_ENV !== 'test' ||
  !env.S3_BUCKET.startsWith('itpc-test-') ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_')
)
  throw new Error('必须由隔离集成入口运行')
const db = createPrisma(env.DATABASE_URL)
let runtime: Awaited<ReturnType<typeof buildApp>>
const owner = 'user-engineer-wang',
  collab = 'user-engineer-zhao',
  manager = 'user-manager-chen',
  business = 'user-business-li'
const cookies: Record<string, string> = {}
const department = `聚合集成-${randomUUID()}`
const ids: string[] = []
async function get<T>(url: string, user = business) {
  const result = await runtime.app.inject({ url, headers: { cookie: cookies[user] } })
  expect(result.statusCode, result.body).toBe(200)
  return result.json<{ data: T }>().data
}
const query = (extra = '') => `department=${encodeURIComponent(department)}${extra}`
beforeAll(async () => {
  runtime = await buildApp(env, { logging: false })
  await runtime.app.ready()
  for (const userId of [owner, collab, manager, business]) {
    const res = await runtime.app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      headers: { origin: env.WEB_ORIGIN },
      payload: { userId }
    })
    expect(res.statusCode).toBe(200)
    cookies[userId] = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  }
  for (let i = 0; i < 3; i++) {
    const p = await db.project.create({
      data: {
        name: `聚合项目${i}`,
        department,
        primaryOwnerId: i === 2 ? collab : owner,
        members: { create: { userId: i === 2 ? owner : collab } },
        createdAt: new Date('2026-08-15T04:00:00Z'),
        currentDeliveryDate: new Date('2026-10-15'),
        originalDeliveryDate: new Date('2026-09-20'),
        overallProgress: 50,
        risks: i === 0 ? ['项目延期 8 天'] : i === 1 ? ['已有 4 个工作日未更新整体进度'] : [],
        riskVersion: 7
      }
    })
    ids.push(p.id)
  }
  for (const [date, name] of [
    ['2026-08-10', '八月'],
    ['2026-10-10', '十月']
  ])
    await db.demand.create({
      data: {
        name: name!,
        department,
        ownerId: business,
        status: 'PENDING',
        submittedAt: new Date(date!)
      }
    })
})
afterAll(async () => {
  await runtime?.app.close()
  await db.$disconnect()
})
it('AC017/018：三角色全员可读，负责人含协作、风险指标同源、分页不改变统计', async () => {
  for (const user of [business, owner, manager]) {
    const data = await get<Awaited<ReturnType<typeof dashboard>>>(
      `/api/dashboard?${query(`&person=${owner}&pageSize=1`)}`,
      user
    )
    expect(data.total).toBe(3)
    expect(data.items).toHaveLength(1)
    expect(data.projects).toHaveLength(3)
    expect(data.attention.map((p) => p.id)).toEqual(ids.slice(0, 2))
    expect(data.metrics.find((m) => m.key === 'delayed')?.value).toBe(1)
    expect(data.distribution.find((g) => g.key === 'delayed')?.projects.map((p) => p.id)).toEqual([
      ids[0]
    ])
    expect(data.metrics.find((m) => m.key === 'pending')?.value).toBe(2)
    expect(data.projects[0]?.risks).toEqual(['项目延期 8 天'])
  }
  const filtered = await get<Awaited<ReturnType<typeof dashboard>>>(
    `/api/dashboard?${query('&risk=delayed&page=2&pageSize=1')}`
  )
  expect(filtered.total).toBe(1)
  expect(filtered.items).toEqual([])
  expect(filtered.metrics.find((m) => m.key === 'delayed')?.value).toBe(filtered.projects.length)
  const mine = await get<Awaited<ReturnType<typeof dashboard>>>(
    `/api/dashboard?${query('&scope=mine')}`
  )
  expect(mine.total).toBe(0)
})
it('AC019/020：主责2协作1，多人项目只有唯一主责且项目明细对齐', async () => {
  const data = await get<ReturnType<typeof personWorkload>>(
    `/api/workload?${query('&month=2026-09')}`
  )
  const row = data.find((r) => r.user.id === owner)!
  expect(row.primary).toHaveLength(2)
  expect(row.collaboration).toHaveLength(1)
  expect(row.projects).toHaveLength(3)
  expect(row.overlap).toBe(2)
  expect(data.reduce((n, r) => n + r.primary.length, 0)).toBe(3)
  expect(row.delayed.map((p) => p.id)).toEqual([ids[0]])
})
it('AC021/022：跨月整体比例裁剪，原交付标记与持久风险文字保留', async () => {
  const data = await get<ReturnType<typeof buildGanttRows>>(
    `/api/gantt?${query('&month=2026-09&risk=delayed')}`
  )
  expect(data).toHaveLength(1)
  expect(data[0]).toMatchObject({
    left: 0,
    width: 30,
    progressWidth: 14,
    originalMarker: 19.5,
    clipped: true,
    outside: false,
    risks: ['项目延期 8 天']
  })
  expect(data[0]?.project.overallProgress).toBe(50)
  const ownerOnly = await get<ReturnType<typeof buildGanttRows>>(
    `/api/gantt?${query(`&month=2026-09&ownerId=${owner}`)}`
  )
  expect(ownerOnly).toHaveLength(2)
})
it('需求统计筛选与明细一致，中间空月份补零', async () => {
  const data = await get<Awaited<ReturnType<typeof demandStatistics>>>(
    `/api/demand-statistics?${query('&scope=mine&status=pending')}`
  )
  expect(data.demands).toHaveLength(2)
  expect(data.submitters[0]?.value).toBe(data.demands.length)
  expect(data.departments[0]?.demands.map((d) => d.id)).toEqual(data.demands.map((d) => d.id))
  expect(data.trend).toEqual({
    months: ['2026-08', '2026-09', '2026-10'],
    departments: [{ name: department, data: [1, 0, 1] }]
  })
  const empty = await get<Awaited<ReturnType<typeof demandStatistics>>>(
    `/api/demand-statistics?${query('&keyword=不存在')}`
  )
  expect(empty).toEqual({
    demands: [],
    submitters: [],
    departments: [],
    trend: { months: [], departments: [] }
  })
})
it('逾期项目仍计入当前月主责时间重叠', async () => {
  const today = businessDate(new Date()),
    month = today.slice(0, 7)
  const previous = new Date(Date.parse(`${month}-01`) - 86400000)
  await db.project.updateMany({
    where: { id: { in: ids.slice(0, 2) } },
    data: { createdAt: new Date('2000-01-01'), currentDeliveryDate: previous }
  })
  const data = await get<ReturnType<typeof personWorkload>>(
    `/api/workload?${query(`&month=${month}`)}`
  )
  expect(data.find((r) => r.user.id === owner)?.overlap).toBe(2)
})
it('阻塞天数取连续整体历史上海日期，说明中的3不当作天数且个人更新不打断', async () => {
  const today = businessDate(new Date())
  const at = (days: number) => new Date(Date.parse(`${today}T04:00:00Z`) - days * 86400000)
  const p = await db.project.create({
    data: {
      name: '阻塞持续历史',
      department: `${department}-blocked`,
      primaryOwnerId: owner,
      createdAt: at(20),
      simpleStatus: 'blocked',
      blocker: '等待3号服务器',
      risks: ['已阻塞：等待3号服务器']
    }
  })
  for (const [days, status, kind] of [
    [15, 'blocked', 'overall'],
    [10, 'in-progress', 'overall'],
    [7, 'blocked', 'overall'],
    [4, 'in-progress', 'personal'],
    [1, 'blocked', 'overall']
  ] as const)
    await db.progressUpdate.create({
      data: {
        projectId: p.id,
        authorId: owner,
        kind,
        status,
        stage: '方案设计',
        summary: '连续阻塞历史',
        blocker: status === 'blocked' ? '等待3号服务器' : '',
        createdAt: at(days),
        overallProgress: kind === 'overall' ? 20 : null
      }
    })
  const url = `/api/dashboard?department=${encodeURIComponent(`${department}-blocked`)}`
  let data = await get<Awaited<ReturnType<typeof dashboard>>>(url)
  expect(data.attentionDays[p.id]).toBe(7)
  await db.progressUpdate.create({
    data: {
      projectId: p.id,
      authorId: manager,
      kind: 'overall',
      status: 'blocked',
      stage: '方案设计',
      summary: '管理纠正：仍等待3号服务器',
      blocker: '等待3号服务器',
      createdAt: at(0),
      overallProgress: 25
    }
  })
  data = await get<Awaited<ReturnType<typeof dashboard>>>(url)
  expect(data.attentionDays[p.id]).toBe(7)
  const legacy = await db.project.create({
    data: {
      name: '无历史遗留阻塞',
      department: `${department}-blocked`,
      primaryOwnerId: owner,
      createdAt: at(12),
      simpleStatus: 'blocked',
      blocker: '等待99号服务器',
      risks: ['已阻塞：等待99号服务器']
    }
  })
  data = await get<Awaited<ReturnType<typeof dashboard>>>(url)
  expect(data.attentionDays[legacy.id]).toBe(12)
  expect(data.attention.map((row) => row.id)).toEqual([legacy.id, p.id])
  // 取消后重开会恢复进行中，不能把再次阻塞接到重开前的历史段。
  await db.lifecycleEvent.createMany({
    data: [
      {
        entityType: 'project',
        entityId: p.id,
        authorId: manager,
        action: 'cancel',
        reason: '暂停项目',
        createdAt: at(3),
        before: { status: 'ACTIVE', simpleStatus: 'blocked' },
        after: { status: 'CANCELLED', simpleStatus: 'blocked' }
      },
      {
        entityType: 'project',
        entityId: p.id,
        authorId: manager,
        action: 'reopen',
        reason: '',
        createdAt: at(2),
        before: { status: 'CANCELLED', simpleStatus: 'blocked' },
        after: { status: 'ACTIVE', simpleStatus: 'in-progress' }
      }
    ]
  })
  data = await get<Awaited<ReturnType<typeof dashboard>>>(url)
  expect(data.attentionDays[p.id]).toBe(1)
})
it('未登录被拒；非法日期、月份、分页、枚举和未知参数严格拒绝', async () => {
  expect((await runtime.app.inject({ url: '/api/dashboard' })).statusCode).toBe(401)
  for (const url of [
    '/api/dashboard?from=2026-02-30',
    '/api/dashboard?from=2026-10-01&to=2026-09-01',
    '/api/dashboard?page=0',
    '/api/dashboard?pageSize=101',
    '/api/dashboard?includeArchived=yes',
    '/api/dashboard?stage=未知',
    '/api/workload?month=2026-13',
    '/api/gantt?month=0000-01',
    '/api/gantt?month=2026-09&owner=oops',
    '/api/demand-statistics?status=no'
  ])
    expect(
      (await runtime.app.inject({ url, headers: { cookie: cookies[business] } })).statusCode,
      url
    ).toBe(400)
})
