import { expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'
import { canApproveProjects } from '@/utils/project-approver'
import { submitProjectProposal, resubmitProjectProposal } from './proposal-service'
import { reviewDemand, createProject } from './project-service'
import { responsibilityTasks } from './task-service'
import { setManager } from './management-service'

const input = { requestId: 'authority-test', name: '权限回归', department: 'IT部', primaryOwnerId: 'user-engineer-wang', collaboratorIds: [], priority: 'P1' as const, approvedLaunchDate: '2099-10-08' }
it('新增管理员没有立项能力及立项待办，保留风险待办；原型写入口拒绝', () => {
  const snapshot = createInitialPrototypeSnapshot()
  const proposal = submitProjectProposal(snapshot, input)
  proposal.status = 'returned'
  setManager(snapshot, { userId: 'user-engineer-zhao', enabled: true })
  snapshot.activeUserId = 'user-engineer-zhao'
  const user = snapshot.database.users.find(u => u.id === snapshot.activeUserId)!
  expect(user.role).toBe('manager')
  expect(canApproveProjects(user)).toBe(false)
  for (const decision of ['establish', 'return', 'reject'] as const)
    expect(() => reviewDemand(snapshot, { demandId: 'D-2026-013', decision, reason: '测试', project: input })).toThrow()
  expect(() => createProject(snapshot, input)).toThrow()
  expect(() => submitProjectProposal(snapshot, input)).toThrow()
  expect(() => resubmitProjectProposal(snapshot, proposal.id, proposal.version, input)).toThrow()
  snapshot.database.projects[0].risks = ['项目阻塞']
  snapshot.database.projects[0].riskVersion = 1
  const tasks = responsibilityTasks(snapshot.database, user)
  expect(tasks.some(t => ['review', 'reassess', 'proposal'].includes(t.action))).toBe(false)
  expect(tasks.some(t => t.action === 'coordinate')).toBe(true)
})
it('旧演示审批人明确迁移，普通管理员不自动获权，显式撤销能力不被迁移恢复', () => {
  const snapshot = createInitialPrototypeSnapshot()
  delete snapshot.database.users[0].canApproveProjects
  snapshot.database.users[1].role = 'manager'
  const migrated = migratePrototypeSnapshot(snapshot)
  expect(canApproveProjects(migrated.database.users[0])).toBe(true)
  expect(canApproveProjects(migrated.database.users[1])).toBe(false)
  migrated.database.users[0].canApproveProjects = false
  expect(canApproveProjects(migratePrototypeSnapshot(migrated).database.users[0])).toBe(false)
})
