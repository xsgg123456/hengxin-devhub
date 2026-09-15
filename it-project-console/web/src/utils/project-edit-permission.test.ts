import { describe, expect, it, vi } from 'vitest'
vi.mock('@/config/runtime', () => ({ runtimeConfig: { isPrototype: false } }))
import { canEditProject } from './project-edit-permission'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
describe('正式项目完整编辑权限', () => {
  it('名称不能授予临时权限，核实字段与当前主责决定授权', () => {
    const db = createInitialPrototypeSnapshot().database
    const project = db.projects[0]!
    const owner = db.users.find(u => u.id === project.primaryOwnerId)!
    project.name = '【迁移待核实】自行改名'
    delete project.migrationVerified
    expect(canEditProject(owner, project)).toBe(false)
    project.migrationVerified = false
    expect(canEditProject(owner, project)).toBe(true)
    project.migrationVerified = true
    expect(canEditProject(owner, project)).toBe(false)
    project.migrationVerified = false
    project.primaryOwnerId = 'other'
    expect(canEditProject(owner, project)).toBe(false)
    const manager = db.users.find(u => u.canApproveProjects)!
    expect(canEditProject(manager, project)).toBe(true)
  })
})
