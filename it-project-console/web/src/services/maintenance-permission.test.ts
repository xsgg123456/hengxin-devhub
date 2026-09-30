import { expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'
import { hasManagementPermissions } from '@/utils/management-permission'
import { canApproveProjects } from '@/utils/project-approver'
import { canAccessUser, getHomePath, getNavigation } from '@/router/access'
import { actionProject } from './lifecycle-service'
import { createProject } from './project-service'
import { projectInput, planFixture } from './workflow-fixtures'
import { responsibilityTasks } from './task-service'
import { submitProjectProposal, confirmProjectProposal } from './proposal-service'
import { setManager } from './management-service'
import { updateProgress } from './progress-service'
import { actionAcceptance } from './acceptance-service'

function setup() {
  const snapshot = createInitialPrototypeSnapshot()
  const user = snapshot.database.users.find(u => u.id === 'user-engineer-wang')!
  user.maintenanceAdmin = true
  user.canApproveProjects = true
  snapshot.activeUserId = user.id
  return { snapshot, user }
}

it('独立维护能力不改变工程师首页、身份、默认菜单，撤销后收回管理入口', () => {
  const { snapshot, user } = setup()
  expect(hasManagementPermissions(user)).toBe(true)
  expect(canApproveProjects(user)).toBe(true)
  expect(getHomePath(user.role)).toBe('/my-projects')
  expect(getNavigation(user.role, user).slice(0, 4)).toEqual(getNavigation('engineer'))
  expect(canAccessUser(user, ['manager'])).toBe(true)
  expect(migratePrototypeSnapshot(snapshot).database.users.find(u => u.id === user.id)).toMatchObject({
    role: 'engineer', roleLabel: 'IT工程师', maintenanceAdmin: true
  })
  user.maintenanceAdmin = false
  expect(canApproveProjects(user)).toBe(false)
  expect(canAccessUser(user, ['manager'])).toBe(false)
  expect(getNavigation(user.role, user)).toEqual(getNavigation('engineer'))
  expect(migratePrototypeSnapshot(snapshot).database.users.find(u => u.id === user.id)?.maintenanceAdmin).toBe(false)
  expect(canApproveProjects({ ...user, role: 'business', canApproveProjects: true })).toBe(false)
})

it('维护工程师同时具有审批待办和自己的接单能力，接单不改角色', () => {
  const { snapshot, user } = setup()
  const proposal = submitProjectProposal(snapshot, projectInput)
  const tasks = responsibilityTasks(snapshot.database, user)
  expect(tasks.some(t => t.action === 'review')).toBe(true)
  expect(tasks.find(t => t.proposalId === proposal.id)?.action).toBe('confirm')
  confirmProjectProposal(snapshot, proposal.id, proposal.version, 'accept')
  expect(proposal.status).toBe('confirmed')
  expect(user.role).toBe('engineer')
})

it('维护工程师可维护他人项目、验收人及名单，撤销后拒绝额外写操作', () => {
  const { snapshot, user } = setup()
  const project = createProject(snapshot, { ...projectInput, primaryOwnerId: 'user-engineer-zhao', collaboratorIds: [] })
  planFixture(snapshot, project)
  updateProgress(snapshot, { projectId: project.id, kind: 'overall', status: 'in-progress', summary: '维护核对' })
  actionAcceptance(snapshot, { projectId: project.id, version: project.version ?? 0, requestId: 'assign-maintenance', action: 'assign', ownerId: 'user-business-li', summary: '核实验收负责人' })
  setManager(snapshot, { userId: 'user-business-li', enabled: true })
  actionProject(snapshot, { projectId: project.id, action: 'cancel', reason: '维护取消' })
  actionProject(snapshot, { projectId: project.id, action: 'reopen' })
  actionProject(snapshot, { projectId: project.id, action: 'archive' })
  user.maintenanceAdmin = false
  expect(() => actionProject(snapshot, { projectId: project.id, action: 'delete' })).toThrow('只有管理人员')
  expect(() => setManager(snapshot, { userId: 'user-business-li', enabled: false })).toThrow('只有管理人员')
  user.maintenanceAdmin = true
  actionProject(snapshot, { projectId: project.id, action: 'delete' })
  expect(snapshot.database.projects.some(p => p.id === project.id)).toBe(false)
  expect(user.role).toBe('engineer')
})
