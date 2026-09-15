import { describe, expect, it, vi } from 'vitest'
vi.mock('@/config/runtime', () => ({ runtimeConfig: { isPrototype: true } }))
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { PROJECT_STAGES } from '@/domain/prototype'
import { saveProjectEditPreview, isMigrationPending } from './project-edit-preview'
import { isPrototypeSnapshot } from '@/repositories/prototype-validation'
import { canEditProject } from '@/utils/project-edit-permission'
function setup() {
  const snapshot = createInitialPrototypeSnapshot()
  const p = snapshot.database.projects[0]
  p.name = '【迁移待核实】演示项目'
  p.businessOwnerId = 'user-business-li'
  p.firstRequestedOn = '2026-07-15'
  const baseline = JSON.stringify(p)
  const edit = structuredClone(p)
  edit.stagePlans = PROJECT_STAGES.map(stage => ({ stage, startDate: '', endDate: '' }))
  return { snapshot, p, baseline, edit }
}
describe('全局编辑本地预览', () => {
  it('主责可编辑待核实项目，协作、无关工程师、业务和非指定管理员无权', () => {
    const {snapshot,p,baseline,edit} = setup()
    for (const user of snapshot.database.users) {
      const expected = (user.role === 'manager' && user.canApproveProjects === true) ||
        (user.role === 'engineer' && user.id === p.primaryOwnerId)
      expect(canEditProject(user,p)).toBe(expected)
      if (!expected) {
        snapshot.activeUserId=user.id
        const forged=structuredClone(edit)
        forged.primaryOwnerId=user.id
        expect(() => saveProjectEditPreview(snapshot,forged,baseline,'核实',false)).toThrow('无完整编辑权限')
        expect(JSON.stringify(p)).toBe(baseline)
      }
    }
    const primary=snapshot.database.users.find(u=>u.id===p.primaryOwnerId)!
    expect(canEditProject({...primary, role:'manager',canApproveProjects:false},p)).toBe(false)
    const collaborator=snapshot.database.users.find(u=>u.role==='engineer' && u.id!==p.primaryOwnerId)!
    expect(canEditProject(collaborator,{...p,collaboratorIds:[collaborator.id]})).toBe(false)
    snapshot.activeUserId=p.primaryOwnerId
    edit.description='工程师核对的资料'
    saveProjectEditPreview(snapshot,edit,baseline,'核对旧资料',false)
    expect(p.description).toBe(edit.description)
    expect(snapshot.database.lifecycleEvents[0]?.authorId).toBe(p.primaryOwnerId)
  })
  it('正常项目不能通过提交迁移标记或主责变更获取权限', () => {
    const {snapshot,p,edit}=setup()
    snapshot.activeUserId=p.primaryOwnerId
    p.name='正常项目'
    expect(() => saveProjectEditPreview(snapshot,edit,JSON.stringify(p),'改名',false)).toThrow('无完整编辑权限')
    p.migrationVerified=true
    p.name='【迁移待核实】已核实项目'
    expect(() => saveProjectEditPreview(snapshot,edit,JSON.stringify(p),'改名',false)).toThrow('无完整编辑权限')
  })
  it('核实后收回主责完整编辑权限，指定管理员仍可编辑', () => {
    const {snapshot,p,baseline,edit}=setup()
    snapshot.activeUserId=p.primaryOwnerId
    saveProjectEditPreview(snapshot,edit,baseline,'资料已核对',true)
    expect(() => saveProjectEditPreview(snapshot,structuredClone(p),JSON.stringify(p),'再次修改',false)).toThrow('无完整编辑权限')
    snapshot.activeUserId='user-manager-chen'
    expect(() => saveProjectEditPreview(snapshot,structuredClone(p),JSON.stringify(p),'管理员修订',false)).not.toThrow()
  })
  it('转交主责后旧主责失权，新主责可继续核实', () => {
    const {snapshot,p,baseline,edit}=setup()
    snapshot.activeUserId=p.primaryOwnerId
    const next=snapshot.database.users.find(u=>u.role==='engineer' && u.id!==p.primaryOwnerId)!
    edit.primaryOwnerId=next.id; edit.collaboratorIds=[]
    saveProjectEditPreview(snapshot,edit,baseline,'转交核实',false)
    expect(() => saveProjectEditPreview(snapshot,structuredClone(p),JSON.stringify(p),'旧主责修改',false)).toThrow('无完整编辑权限')
    snapshot.activeUserId=next.id
    expect(() => saveProjectEditPreview(snapshot,structuredClone(p),JSON.stringify(p),'继续核实',false)).not.toThrow()
    expect(snapshot.database.lifecycleEvents[0]?.authorId).toBe(next.id)
  })
  it('首次提出日期同步关联需求，保留原系统时间且审计含前后值', () => {
    const {snapshot,p,baseline,edit} = setup()
    const demand = snapshot.database.demands.find(d => d.id === p.demandId)!
    const submittedAt = demand.submittedAt, createdAt = p.createdAt
    const stageExpectedDate = p.stageExpectedDate
    edit.firstRequestedOn = '2026-06-10'
    saveProjectEditPreview(snapshot,edit,baseline,'按业务原始记录补录',false)
    expect(p.firstRequestedOn).toBe('2026-06-10')
    expect(demand.firstRequestedOn).toBe('2026-06-10')
    expect(demand.submittedAt).toBe(submittedAt)
    expect(p.createdAt).toBe(createdAt)
    expect(p.stageExpectedDate).toBe(stageExpectedDate)
    expect(snapshot.database.lifecycleEvents[0]?.before.details).toContain('2026-07-15')
    expect(snapshot.database.lifecycleEvents[0]?.after.details).toContain('2026-06-10')
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })
  it('未知日期允许暂存但不能完成核实，未来和非法日期不写入', () => {
    const {snapshot,p,baseline,edit} = setup()
    edit.firstRequestedOn = '2999-01-01'
    expect(() => saveProjectEditPreview(snapshot,edit,baseline,'补录',false)).toThrow('不能晚于今天')
    edit.firstRequestedOn = '2026-02-30'
    expect(() => saveProjectEditPreview(snapshot,edit,baseline,'补录',false)).toThrow('不是有效日期')
    edit.firstRequestedOn = ''
    expect(() => saveProjectEditPreview(snapshot,edit,baseline,'补录',true)).toThrow('补齐需求首次提出日期')
    expect(JSON.stringify(p)).toBe(baseline)
    saveProjectEditPreview(snapshot,edit,baseline,'原记录待查证',false)
    expect(p.firstRequestedOn).toBe('')
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })
  it('仅改名可保存且保持原型数据有效，普通改名不解除核实', () => {
    const {snapshot,p,baseline,edit} = setup()
    edit.name = '修改后的名称'
    saveProjectEditPreview(snapshot,edit,baseline,'核对名称',false)
    expect(isMigrationPending(p)).toBe(true)
    expect(p.name).toBe('【迁移待核实】修改后的名称')
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })
  it('完成核实解除标记且保存七阶段有效计划', () => {
    const {snapshot,p,baseline,edit} = setup()
    edit.stagePlans!.forEach(row => {row.startDate='2026-09-20'; row.endDate='2026-09-20'})
    saveProjectEditPreview(snapshot,edit,baseline,'已逐项核实',true)
    expect(isMigrationPending(p)).toBe(false)
    expect(p.stagePlans).toHaveLength(7)
    const second = structuredClone(p)
    second.stagePlans![0].endDate = '2026-09-21'
    saveProjectEditPreview(snapshot, second, JSON.stringify(p), '再次核对计划', false)
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })
  it('错误验收人及主协作重复均拒绝且项目不变', () => {
    const {snapshot,p,baseline,edit} = setup()
    edit.acceptanceOwnerId='user-engineer-wang'
    expect(() => saveProjectEditPreview(snapshot,edit,baseline,'核实',true)).toThrow('业务人员')
    edit.acceptanceOwnerId='user-business-li'; edit.collaboratorIds=[edit.primaryOwnerId]
    expect(() => saveProjectEditPreview(snapshot,edit,baseline,'核实',false)).toThrow('不能与主负责人重复')
    expect(JSON.stringify(p)).toBe(baseline)
  })
  it('缺少必要核实资料及过期快照被拒绝', () => {
    const {snapshot,baseline,edit} = setup()
    edit.businessOwnerId=''
    expect(() => saveProjectEditPreview(snapshot,edit,baseline,'核实',true)).toThrow('补齐')
    expect(() => saveProjectEditPreview(snapshot,edit,'old','核实',false)).toThrow('更新')
  })
  it('更换人员与日期保留原历史，并生成日期调整记录', () => {
    const {snapshot,p,baseline,edit} = setup()
    const oldHistory=structuredClone(snapshot.database.progressUpdates)
    edit.primaryOwnerId='user-engineer-zhao'; edit.collaboratorIds=[]
    edit.expectedDeliveryDate='2026-12-30'
    saveProjectEditPreview(snapshot,edit,baseline,'按实际修订',false)
    expect(p.primaryOwnerId).toBe('user-engineer-zhao')
    expect(snapshot.database.progressUpdates).toEqual(oldHistory)
    expect(snapshot.database.scheduleChanges.at(-1)?.newValue).toBe('2026-12-30')
    expect(isPrototypeSnapshot(snapshot)).toBe(true)
  })
})


