import { describe, expect, it } from 'vitest'
import { fresh, demandInput, projectInput, planFixture, acceptFixture } from './workflow-fixtures'
import { saveDemand } from './demand-service'
import { reviewDemand } from './project-service'
import { confirmProjectProposal } from './proposal-service'
import { remainingStages } from './stage-plan-service'
import { actionDemand, actionProject } from './lifecycle-service'
import { updateProgress } from './progress-service'
import { stageExecutions } from './stage-execution'
import { migratePrototypeSnapshot } from '@/repositories/prototype-migration'
function setup() {
  const s = fresh(), parent = s.database.projects[0]
  parent.status = 'completed'; parent.archived = true
  const before = structuredClone(parent)
  const input = { ...demandInput, parentProjectId: parent.id, optimizationOutcome: '导出结果正确', attachments: [], prd: null, prototype: null }
  return { s, parent, before, input }
}
describe('正式单节点优化', () => {
  it('无附件提交、指定审批、接单、单节点计划、业务验收且父项目不变', () => {
    const { s, parent, before, input } = setup()
    const d = saveDemand(s, input)
    expect(d.firstRequestedOn).toBe('2026-09-08')
    s.activeUserId = 'user-engineer-wang'
    expect(() => reviewDemand(s, { demandId: d.id, decision: 'establish', project: projectInput })).toThrow('指定立项审批人')
    s.activeUserId = 'user-manager-chen'
    reviewDemand(s, { demandId: d.id, decision: 'establish', project: projectInput })
    expect(s.database.projects.some(p => p.demandId === d.id)).toBe(false)
    const proposal = s.database.projectProposals!.find(p => p.demandId === d.id)!
    s.activeUserId = proposal.primaryOwnerId
    confirmProjectProposal(s, proposal.id, proposal.version, 'accept')
    const p = s.database.projects.find(p => p.demandId === d.id)!
    expect(p.parentProjectId).toBe(parent.id)
    expect(remainingStages(p)).toEqual(['验收交付'])
    planFixture(s, p)
    expect(p.expectedLaunchDate).toBe(p.expectedDeliveryDate)
    expect(p.originalLaunchDate).toBe(p.originalDeliveryDate)
    expect(stageExecutions(p, s.database.stageHistories)).toHaveLength(1)
    expect(() => updateProgress(s, { projectId: p.id, kind: 'overall', summary: '', status: 'completed' })).toThrow('业务验收')
    acceptFixture(s, p)
    expect(p.status).toBe('completed')
    expect(parent).toEqual(before)
  })
  it('普通附件要求、优化标准要求、父级资格和关联不可变', () => {
    const { s, parent, input } = setup()
    expect(() => saveDemand(s, { ...input, optimizationOutcome: '' })).toThrow('验收标准')
    expect(() => saveDemand(s, { ...input, parentProjectId: null })).toThrow()
    parent.status = 'active'
    expect(() => saveDemand(s, input)).toThrow('已完成主项目')
    parent.status = 'completed'; parent.parentProjectId = 'another'
    expect(() => saveDemand(s, input)).toThrow('已完成主项目')
    parent.parentProjectId = null
    const d = saveDemand(s, input)
    expect(() => saveDemand(s, { ...input, id: d.id, parentProjectId: null })).toThrow('不可更换')
  })
  it('关联优化阻止父项目及原需求删除，单条优化删除不影响父项目', () => {
    const { s, parent, before, input } = setup()
    const d = saveDemand(s, { ...input, submit: false })
    s.activeUserId = 'user-manager-chen'
    expect(() => actionProject(s, { projectId: parent.id, action: 'delete' })).toThrow('关联优化')
    if (parent.demandId) expect(() => actionDemand(s, { demandId: parent.demandId!, action: 'delete' })).toThrow('关联优化')
    actionDemand(s, { demandId: d.id, action: 'delete' })
    expect(parent).toEqual(before)
    expect(s.database.demands.some(row => row.id === d.id)).toBe(false)
  })
  it('待评估优化修改仍须验收标准，审批拒绝缺失标准的存量记录', () => {
    const { s, input } = setup()
    const d = saveDemand(s, input)
    expect(() => saveDemand(s, { ...input, id: d.id, submit: false, optimizationOutcome: '' })).toThrow('验收标准')
    expect(d.optimizationOutcome).toBe(input.optimizationOutcome)
    d.optimizationOutcome = ''
    s.activeUserId = 'user-manager-chen'
    expect(() => reviewDemand(s, { demandId: d.id, decision: 'establish', project: projectInput })).toThrow('验收标准')
    expect(d.status).toBe('pending')
    expect(s.database.projectProposals?.some(p => p.demandId === d.id)).toBeFalsy()
  })
  it('迁移默认普通字段，刷新保存优化归属', () => {
    const { s, input } = setup()
    const d = saveDemand(s, input)
    const migrated = migratePrototypeSnapshot(s)
    expect(migrated.database.demands.find(row => row.id === d.id)).toMatchObject({ parentProjectId: input.parentProjectId, optimizationOutcome: input.optimizationOutcome })
    expect(migrated.database.projects.every(p => p.parentProjectId === null)).toBe(true)
  })
})
