import { describe, expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { responsibilityTasks } from './task-service'
import { computeProjectRisks, workdaysBetween } from './risk-service'

const now = '2026-09-08T12:00:00+08:00'
function setup() {
  const db = createInitialPrototypeSnapshot().database
  db.scheduleChanges = []
  db.projects.forEach((p) => {
    p.status = 'active'
    p.archived = false
    p.simpleStatus = 'in-progress'
    p.expectedDeliveryDate = '2026-12-30'
    p.originalDeliveryDate = '2026-12-30'
    p.stageExpectedDate = '2026-10-30'
    p.lastOverallUpdatedAt = now
    p.createdAt = '2026-08-01T00:00:00+08:00'
  })
  return db
}
describe('职责待办与确定性风险', () => {
  it('经理异常按延期、阻塞、停更排序，同级按天数，待评估可操作', () => {
    const db = setup(),
      base = db.projects[0]
    db.projects = [
      { ...base, id: 'stale', lastOverallUpdatedAt: '2026-09-02T10:00:00+08:00' },
      { ...base, id: 'blocked', simpleStatus: 'blocked', blocker: '等待接口' },
      { ...base, id: 'delay2', expectedDeliveryDate: '2026-09-06' },
      { ...base, id: 'delay5', expectedDeliveryDate: '2026-09-03' }
    ]
    const tasks = responsibilityTasks(
      db,
      db.users.find((u) => u.role === 'manager')!,
      now
    )
    expect(tasks[0].action).toBe('review')
    expect(tasks.filter(t => t.action === 'coordinate').map((t) => t.id)).toEqual(['delay5', 'delay2', 'blocked', 'stale'])
    expect(tasks.find((t) => t.action === 'review')?.demandId).toBeTruthy()
  })
  it('工程师不收到无职责事项或健康项目强制日报，协作入口不冒充整体更新', () => {
    const db = setup(),
      engineer = db.users.find((u) => u.id === 'user-engineer-wang')!
    const base = db.projects[0]
    db.projects = [
      { ...base, id: 'healthy', primaryOwnerId: engineer.id, collaboratorIds: [] },
      {
        ...base,
        id: 'personal',
        primaryOwnerId: 'user-engineer-zhao',
        collaboratorIds: [engineer.id]
      },
      {
        ...base,
        id: 'other',
        primaryOwnerId: 'user-engineer-zhao',
        collaboratorIds: [],
        simpleStatus: 'blocked'
      }
    ]
    expect(responsibilityTasks(db, engineer, now).map((t) => [t.id, t.action])).toEqual([
      ['personal', 'personal']
    ])
    db.projects[0].lastOverallUpdatedAt = '2026-09-02T10:00:00+08:00'
    expect(responsibilityTasks(db, engineer, now)[0]).toMatchObject({
      id: 'healthy',
      action: 'overall',
      days: 4
    })
  })
  it('业务只看本人退回补充，归档与取消不产生异常任务', () => {
    const db = setup(),
      user = db.users.find((u) => u.role === 'business')!
    db.demands[0].status = 'returned'
    db.demands[0].submitterId = user.id
    db.demands[1].status = 'returned'
    db.demands[1].submitterId = 'someone-else'
    expect(responsibilityTasks(db, user, now).map((t) => t.id)).toEqual([db.demands[0].id])
    db.projects.forEach((p) => {
      p.archived = true
      p.expectedDeliveryDate = '2026-09-01'
    })
    expect(responsibilityTasks(db, db.users[0], now).every((t) => !t.projectId)).toBe(true)
  })
  it('停更跳过周末且仅依赖整体更新，周五到周三达到三个工作日', () => {
    expect(workdaysBetween('2026-09-04', '2026-09-08')).toBe(2)
    expect(workdaysBetween('2026-09-04', '2026-09-09')).toBe(3)
    const p = setup().projects[0]
    p.lastOverallUpdatedAt = '2026-09-04T10:00:00+08:00'
    p.updatedAt = '2026-09-09T10:00:00+08:00'
    expect(computeProjectRisks(p, [], now).some((r) => r.includes('未更新'))).toBe(false)
    expect(computeProjectRisks(p, [], '2026-09-09T12:00:00+08:00')).toContain(
      '已有 3 个工作日未更新整体进度'
    )
  })
  it('正式和优化按本轮提交时间排序，待接单在最后，历史调整不产生管理待办', () => {
    const db = setup(), demand = db.demands[0]
    db.demands = [
      {...demand,id:'formal',submittedAt:'2026-09-08T09:00:00Z'},
      {...demand,id:'optimization',parentProjectId:db.projects[0].id,submittedAt:'2026-09-07T09:00:00Z'}
    ]
    db.projects[0].riskVersion = 1
    db.projects[0].risks = ['计划有变：存在日期调整历史']
    db.projectProposals = [{id:'proposal',requestId:'p',version:1,name:'等待接单',department:'IT',demandId:null,priority:'P1',primaryOwnerId:db.users[2].id,collaboratorIds:[],approvedLaunchDate:'2026-09-30',status:'pending',reviewReason:'',createdBy:db.users[0].id,createdAt:now,updatedAt:now,projectId:null}]
    expect(responsibilityTasks(db,db.users[0],now).map(t => t.id)).toEqual(['optimization','formal','proposal'])
    db.demands[1].submittedAt='2026-09-08T10:00:00Z'
    expect(responsibilityTasks(db,db.users[0],now)[0].id).toBe('formal')
    db.projectProposals[0].status='returned'
    db.projectProposals[0].updatedAt='2026-09-08T11:00:00Z'
    expect(responsibilityTasks(db,db.users[0],now).map(t => t.action)).toEqual(['review','review','reassess'])
    db.users[0].canApproveProjects=false
    expect(responsibilityTasks(db,db.users[0],now)).toEqual([])
  })
})
