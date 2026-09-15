import { describe, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({ isPrototype: true }))
vi.mock('@/config/runtime', () => ({ runtimeConfig: runtime }))
import { projectBusinessOwner } from './project-business-owner'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
describe('业务负责人归属', () => {
  it('仅原型缺字段兼容原提出人，清空和正式缺失都不回退', () => {
    const db = createInitialPrototypeSnapshot().database
    const project = db.projects[0]!
    project.demandId = db.demands[0]!.id
    delete project.businessOwnerId
    runtime.isPrototype = true
    expect(projectBusinessOwner(project, db.demands)).toBe(db.demands[0]!.submitterId)
    project.businessOwnerId = ''
    expect(projectBusinessOwner(project, db.demands)).toBe('')
    project.businessOwnerId = 'new-owner'
    expect(projectBusinessOwner(project, db.demands)).toBe('new-owner')
    delete project.businessOwnerId
    runtime.isPrototype = false
    expect(projectBusinessOwner(project, db.demands)).toBeUndefined()
  })
})
