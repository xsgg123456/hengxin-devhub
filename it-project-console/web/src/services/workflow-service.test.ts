import { describe, expect, it } from 'vitest'
import { createProject, reviewDemand, saveDemand, validateAttachment } from './workflow-service'
import { PrototypeRepository, PROTOTYPE_STORAGE_KEY } from '@/repositories/prototype-repository'
import { now, demandInput, projectInput, fresh } from './workflow-fixtures'
describe('需求与立项事务', () => {
  it('草稿容许缺材料，正式提交校验必交材料、日期和说明', () => {
    const snapshot = fresh()
    expect(saveDemand(snapshot, { ...demandInput, submit: false, prd: null }).status).toBe('draft')
    expect(() => saveDemand(snapshot, { ...demandInput, requestId: 'other', attachments: [] })).toThrow(
      '至少上传一个文件'
    )
    expect(() =>
      saveDemand(snapshot, { ...demandInput, requestId: 'other', expectedLaunchDate: '2026-09-07' })
    ).toThrow('不得早于')
    expect(() =>
      saveDemand(snapshot, { ...demandInput, requestId: 'other', description: ' ' })
    ).toThrow('项目说明')
  })
  it('每种系统角色都可提交本人需求，重复请求只创建一次', () => {
    for (const id of ['user-business-li', 'user-engineer-wang', 'user-manager-chen']) {
      const snapshot = fresh()
      snapshot.activeUserId = id
      const initial = snapshot.database.demands.length
      const first = saveDemand(snapshot, demandInput)
      expect(saveDemand(snapshot, demandInput).id).toBe(first.id)
      expect(snapshot.database.demands).toHaveLength(initial + 1)
      expect(first.submitterId).toBe(id)
    }
  })
  it('文件格式不限，大小、HTTPS及失败上传仍校验', () => {
    expect(() =>
      validateAttachment({ kind: 'file', name: 'virus.exe', size: 20, status: 'ready' }, 'prd')
    ).not.toThrow()
    expect(() =>
      validateAttachment(
        { kind: 'file', name: 'file.pdf', size: 101 * 1024 * 1024, status: 'ready' },
        'prd'
      )
    ).toThrow('100 MB')
    expect(() =>
      validateAttachment(
        { kind: 'link', name: 'x', url: 'javascript:alert(1)', status: 'ready' },
        'prd'
      )
    ).toThrow('HTTPS')
    expect(() =>
      validateAttachment({ kind: 'file', name: 'file.pdf', size: 20, status: 'failed' }, 'prd')
    ).toThrow('重试')
  })
  it('退回保留原单重提；拒绝不能再编辑；其他用户不能维护', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    snapshot.activeUserId = 'user-manager-chen'
    expect(() => reviewDemand(snapshot, { demandId: demand.id, decision: 'return' })).toThrow(
      '处理原因'
    )
    reviewDemand(snapshot, { demandId: demand.id, decision: 'return', reason: '补充范围' })
    expect(() => saveDemand(snapshot, { ...demandInput, id: demand.id })).toThrow('本人')
    snapshot.activeUserId = 'user-business-li'
    saveDemand(snapshot, { ...demandInput, id: demand.id, requestId: 'resubmit' })
    expect(demand.status).toBe('pending')
    snapshot.activeUserId = 'user-manager-chen'
    reviewDemand(snapshot, { demandId: demand.id, decision: 'reject', reason: '本期不做' })
    snapshot.activeUserId = 'user-business-li'
    expect(() => saveDemand(snapshot, { ...demandInput, id: demand.id })).toThrow('不可编辑')
  })
  it('工程师不能评估；管理立项只创建一次且登记前两阶段完成', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    snapshot.activeUserId = 'user-engineer-wang'
    expect(() =>
      reviewDemand(snapshot, { demandId: demand.id, decision: 'establish', project: projectInput })
    ).toThrow('管理人员')
    snapshot.activeUserId = 'user-manager-chen'
    const first = reviewDemand(snapshot, {
      demandId: demand.id,
      decision: 'establish',
      project: projectInput,
      now
    })
    expect(
      reviewDemand(snapshot, { demandId: demand.id, decision: 'establish', project: projectInput })
        .id
    ).toBe(first.id)
    expect(snapshot.database.projects.filter((row) => row.demandId === demand.id)).toHaveLength(1)
    expect(
      snapshot.database.stageHistories.filter(
        (row) => row.projectId === first.id && row.completedAt
      )
    ).toHaveLength(2)
  })
  it('直接创建不伪造需求，主责与协作互斥', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const count = snapshot.database.demands.length
    expect(() =>
      createProject(snapshot, { ...projectInput, collaboratorIds: [projectInput.primaryOwnerId] })
    ).toThrow('互斥')
    expect(() =>
      createProject(snapshot, { ...projectInput, primaryOwnerId: 'user-business-li' })
    ).toThrow('IT')
    expect(createProject(snapshot, projectInput).demandId).toBeNull()
    expect(snapshot.database.demands).toHaveLength(count)
  })
  it('失败场景与权限拒绝均不落盘，事务异常不保留部分写入', () => {
    const data = new Map<string, string>()
    const repo = new PrototypeRepository({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value)
      }
    })
    repo.load()
    for (const scenario of ['save-error', 'forbidden'] as const) {
      repo.transact((snapshot) => {
        snapshot.scenario = scenario
      })
      const before = data.get(PROTOTYPE_STORAGE_KEY)
      expect(() => repo.transact((snapshot) => saveDemand(snapshot, demandInput))).toThrow()
      expect(data.get(PROTOTYPE_STORAGE_KEY)).toBe(before)
    }
    repo.transact((snapshot) => {
      snapshot.scenario = 'normal'
      snapshot.activeUserId = 'user-business-li'
    })
    const before = data.get(PROTOTYPE_STORAGE_KEY)
    expect(() =>
      repo.transact((snapshot) => {
        saveDemand(snapshot, demandInput)
        throw new Error('失败')
      })
    ).toThrow()
    expect(data.get(PROTOTYPE_STORAGE_KEY)).toBe(before)
  })
})
