import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { PrototypeSnapshot } from '@/domain/prototype'
import { useProjectOverviewFilters } from '@/hooks/business/use-project-overview-filters'
import { createProject } from './project-service'
import { setManager } from './management-service'
import { fresh, projectInput } from './workflow-fixtures'

const state = vi.hoisted(() => ({ snapshot: null as PrototypeSnapshot | null }))
vi.mock('@/config/runtime', () => ({ runtimeConfig: { isPrototype: true } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/store/modules/prototype', () => ({
  usePrototypeStore: () => ({
    database: state.snapshot!.database,
    currentUser: state.snapshot!.database.users.find((u) => u.id === state.snapshot!.activeUserId),
    visibleProjects: state.snapshot!.database.projects,
    visibleDemands: state.snapshot!.database.demands
  })
}))

describe('IT 部门名称兼容', () => {
  it.each(['IT部', '信息技术部'])('%s 成员进入人员候选并可担任负责人和协作人员', (department) => {
    const snapshot = fresh()
    state.snapshot = snapshot
    snapshot.activeUserId = 'user-manager-chen'
    const owner = snapshot.database.users.find((u) => u.id === projectInput.primaryOwnerId)!
    const collaborator = snapshot.database.users.find((u) => u.id === projectInput.collaboratorIds[0])!
    owner.department = department
    collaborator.department = department
    const scope = effectScope()
    try {
      const filters = scope.run(() => useProjectOverviewFilters())!
      const candidateIds = filters.engineers.value.map((u) => u.id)
      expect(candidateIds).toContain(owner.id)
      expect(candidateIds).toContain(collaborator.id)
      expect(candidateIds).not.toContain('user-business-li')
      const project = createProject(snapshot, projectInput)
      expect(project.primaryOwnerId).toBe(owner.id)
      expect(project.collaboratorIds).toEqual([collaborator.id])
      expect(owner).toMatchObject({ department, role: 'engineer' })
    } finally {
      scope.stop()
    }
  })

  it.each(['市场部', 'IT部外协', '信息技术部外协'])('%s 不进入候选且不能分派为 IT 项目成员', (department) => {
    const snapshot = fresh()
    state.snapshot = snapshot
    snapshot.activeUserId = 'user-manager-chen'
    const outsider = snapshot.database.users.find((u) => u.id === 'user-business-li')!
    outsider.department = department
    const scope = effectScope()
    try {
      const filters = scope.run(() => useProjectOverviewFilters())!
      expect(filters.engineers.value.map((u) => u.id)).not.toContain(outsider.id)
      expect(() => createProject(snapshot, { ...projectInput, primaryOwnerId: outsider.id })).toThrow(
        '主负责人'
      )
      expect(() =>
        createProject(snapshot, { ...projectInput, collaboratorIds: [outsider.id] })
      ).toThrow('协作人员')
    } finally {
      scope.stop()
    }
  })

  it('IT部管理员移出管理名单后恢复工程师且保留真实部门名称', () => {
    const snapshot = fresh()
    snapshot.activeUserId = 'user-manager-chen'
    const user = snapshot.database.users.find((u) => u.id === 'user-engineer-wang')!
    user.department = 'IT部'
    setManager(snapshot, { userId: user.id, enabled: true })
    setManager(snapshot, { userId: user.id, enabled: false })
    expect(user).toMatchObject({ department: 'IT部', role: 'engineer', roleLabel: 'IT工程师' })
  })
})
