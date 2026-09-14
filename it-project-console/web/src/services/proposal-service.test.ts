import { actionProject, actionDemand } from './lifecycle-service'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'
import { saveDemand, reviewDemand } from './workflow-service'
import { demandInput } from './workflow-fixtures'
import { describe, expect, it } from 'vitest'
import { fresh, projectInput } from './workflow-fixtures'
import {
  submitProjectProposal,
  deleteProjectProposal,
  confirmProjectProposal,
  resubmitProjectProposal
} from './proposal-service'
import { isPrototypeSnapshot } from '@/repositories/prototype-validation'
import { responsibilityTasks, filterPendingTasks } from './task-service'

describe('工程师接单', () => {
  it('审批只入待办，主责接单后生成一次正式项目，其他用户不能确认', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const count = snapshot.database.projects.length
    const p = submitProjectProposal(snapshot, projectInput)
    expect(snapshot.database.projects).toHaveLength(count)
    expect(() => confirmProjectProposal(snapshot, p.id, 1, 'accept')).toThrow('主负责')
    snapshot.activeUserId = 'user-engineer-zhao'
    expect(() => confirmProjectProposal(snapshot, p.id, 1, 'accept')).toThrow('主负责')
    expect(
      responsibilityTasks(
        snapshot.database,
        snapshot.database.users.find((u) => u.id === snapshot.activeUserId)!
      ).some((t) => t.proposalId === p.id)
    ).toBe(false)
    snapshot.activeUserId = p.primaryOwnerId
    expect(
      responsibilityTasks(
        snapshot.database,
        snapshot.database.users.find((u) => u.id === snapshot.activeUserId)!
      ).some((t) => t.proposalId === p.id)
    ).toBe(true)
    confirmProjectProposal(snapshot, p.id, 1, 'accept')
    expect(snapshot.database.projects).toHaveLength(count + 1)
    expect(
      snapshot.database.projects.find((row) => row.id === p.projectId)?.approvedLaunchDate
    ).toBe(projectInput.approvedLaunchDate)
    expect(() => confirmProjectProposal(snapshot, p.id, 1, 'accept')).toThrow('已更新')
    expect(snapshot.database.projects).toHaveLength(count + 1)
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })
  it('退回必须说明，管理重提可改派且旧主责不能接单', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const p = submitProjectProposal(snapshot, projectInput)
    snapshot.activeUserId = p.primaryOwnerId
    expect(() => confirmProjectProposal(snapshot, p.id, 1, 'return')).toThrow('退回原因')
    confirmProjectProposal(snapshot, p.id, 1, 'return', '资源不足')
    expect(p.reviewReason).toBe('资源不足')
    snapshot.activeUserId = 'user-manager-chen'
    resubmitProjectProposal(snapshot, p.id, 2, {
      ...projectInput,
      primaryOwnerId: 'user-engineer-zhao',
      collaboratorIds: [],
      priority: 'P0',
      approvedLaunchDate: '2026-12-01'
    })
    snapshot.activeUserId = 'user-engineer-wang'
    expect(() => confirmProjectProposal(snapshot, p.id, 3, 'accept')).toThrow('主负责')
    snapshot.activeUserId = p.primaryOwnerId
    expect(() => confirmProjectProposal(snapshot, p.id, 1, 'accept')).toThrow('已更新')
    confirmProjectProposal(snapshot, p.id, 3, 'accept')
    expect(p.status).toBe('confirmed')
  })
  it('审批后的待确认需求可迁移读取且继续跨身份操作', () => {
    const snapshot = fresh()
    const demand = saveDemand(snapshot, demandInput)
    snapshot.activeUserId = 'user-manager-chen'
    reviewDemand(snapshot, { demandId: demand.id, decision: 'establish', project: projectInput })
    const reloaded = migratePrototypeSnapshot(JSON.parse(JSON.stringify(snapshot)))
    expect(isPrototypeSnapshot(reloaded)).toBe(true)
    reloaded.activeUserId = projectInput.primaryOwnerId
    const proposal = reloaded.database.projectProposals![0]
    confirmProjectProposal(reloaded, proposal.id, 1, 'accept')
    expect(reloaded.database.demands.find((d) => d.id === demand.id)?.status).toBe('established')
  })
  it('旧存储缺少proposal集合仍有效，非法审批日期被拒绝', () => {
    const snapshot = fresh()
    delete snapshot.database.projectProposals
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
    snapshot.activeUserId = 'user-manager-chen'
    expect(() =>
      submitProjectProposal(snapshot, { ...projectInput, approvedLaunchDate: '' })
    ).toThrow('审批确认上线日期')
    expect(snapshot.database.projectProposals).toEqual([])
  })
})

it('删除直接正式项目只清理自己的提案，保留其他待接单记录', () => {
  const snapshot = fresh()
  snapshot.activeUserId = 'user-manager-chen'
  const first = submitProjectProposal(snapshot, projectInput)
  const other = submitProjectProposal(snapshot, { ...projectInput, requestId: 'other' })
  snapshot.activeUserId = first.primaryOwnerId
  confirmProjectProposal(snapshot, first.id, 1, 'accept')
  snapshot.activeUserId = 'user-manager-chen'
  actionProject(snapshot, { projectId: first.projectId!, action: 'delete' })
  expect(snapshot.database.projectProposals?.map((p) => p.id)).toEqual([other.id])
})

it('工程师退回后业务编辑撤回锁定，管理退业务使旧提案失效', () => {
  const snapshot = fresh()
  const demand = saveDemand(snapshot, demandInput)
  snapshot.activeUserId = 'user-manager-chen'
  const proposal = reviewDemand(snapshot, { demandId: demand.id, decision: 'establish', project: projectInput })
  snapshot.activeUserId = projectInput.primaryOwnerId
  confirmProjectProposal(snapshot, proposal.id, 1, 'return', '需要更完整材料')
  snapshot.activeUserId = demand.submitterId
  expect(() => saveDemand(snapshot, { ...demandInput, id: demand.id })).toThrow('接单流程')
  expect(() => actionDemand(snapshot, { demandId: demand.id, action: 'withdraw' })).toThrow('不允许撤回')
  snapshot.activeUserId = 'user-manager-chen'
  reviewDemand(snapshot, { demandId: demand.id, decision: 'return', reason: '补充流程图' })
  expect(snapshot.database.projectProposals).toHaveLength(0)
  snapshot.activeUserId = demand.submitterId
  saveDemand(snapshot, { ...demandInput, id: demand.id })
  snapshot.activeUserId = 'user-manager-chen'
  const next = reviewDemand(snapshot, { demandId: demand.id, decision: 'establish', project: { ...projectInput, requestId: 're-review' } })
  expect(next.id).not.toBe(proposal.id)
  snapshot.activeUserId = projectInput.primaryOwnerId
  expect(() => confirmProjectProposal(snapshot, proposal.id, 2, 'accept')).toThrow('不存在')
})

it('待立项任务筛选保留评估与确认，排除风险并匹配部门和本人范围', () => {
  const snapshot = fresh(); snapshot.activeUserId = 'user-manager-chen'
  const p = submitProjectProposal(snapshot, projectInput)
  const actor = snapshot.database.users.find(u => u.id === snapshot.activeUserId)!
  const tasks = responsibilityTasks(snapshot.database, actor)
  const pending = filterPendingTasks(tasks, snapshot.database, actor.id, 'all', '')
  expect(pending.some(t => t.proposalId === p.id)).toBe(true)
  expect(pending.every(t => !!t.proposalId || t.action === 'review')).toBe(true)
  expect(filterPendingTasks(tasks, snapshot.database, actor.id, 'mine', '')).toHaveLength(1)
  expect(filterPendingTasks(tasks, snapshot.database, actor.id, 'all', '不存在的部门')).toHaveLength(0)
})
it('重提审计保存完整前后快照，直接删除用本次时间且保留操作者', () => {
  const snapshot = fresh(); snapshot.activeUserId = 'user-manager-chen'
  const p = submitProjectProposal(snapshot, projectInput)
  snapshot.activeUserId = p.primaryOwnerId
  confirmProjectProposal(snapshot, p.id, 1, 'return', '调整计划')
  snapshot.activeUserId = 'user-manager-chen'
  resubmitProjectProposal(snapshot, p.id, 2, { ...projectInput, priority: 'P0', approvedLaunchDate: '2099-10-01', collaboratorIds: [] })
  const event = snapshot.database.lifecycleEvents[0]
  expect(event.before).toMatchObject({ priority: 'P1', approvedLaunchDate: projectInput.approvedLaunchDate, collaboratorIds: projectInput.collaboratorIds.join(',') })
  expect(event.after).toMatchObject({ priority: 'P0', approvedLaunchDate: '2099-10-01', collaboratorIds: '' })
  const deletionStarted = Date.now()
  deleteProjectProposal(snapshot, p.id, p.version)
  const deleted = snapshot.database.lifecycleEvents[0]
  expect(Date.parse(deleted.createdAt)).toBeGreaterThanOrEqual(deletionStarted)
  expect(deleted).toMatchObject({ action: 'delete', authorId: snapshot.activeUserId, before: { approvedLaunchDate: '2099-10-01' }, after: { deleted: true } })
})
