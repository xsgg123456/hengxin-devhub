import type { PrototypeSnapshot } from '@/domain/prototype'

export function applyTaskTypePreview(snapshot: PrototypeSnapshot) {
  const db = snapshot.database
  db.users[0].name = '姚泽攀'
  db.users[2].name = '张帅'
  const parent = db.projects[0]
  Object.assign(parent, { name: '亚马逊站外客服自动回复（恒鑫智邮）', code: 'XM-2026-0001',
    department: '客服组', status: 'completed', stage: '验收交付', simpleStatus: 'completed',
    overallProgress: 100, acceptanceStatus: 'accepted', priority: 'P2', risks: [], blocker: '',
    expectedLaunchDate: '2026-08-25', originalLaunchDate: '2026-08-25',
    expectedDeliveryDate: '2026-09-01', originalDeliveryDate: '2026-09-01',
    actualCompletedAt: '2026-09-01T09:00:00+08:00' })
  parent.stagePlans = [{stage:'验收交付',startDate:'2026-08-28',endDate:'2026-09-01'}]
  const demand = { ...structuredClone(db.demands[0]), id: 'preview-optimization-demand',
    name: 'testtest', parentProjectId: parent.id, status: 'established' as const,
    description: '优化站外客服回复规则，支持更多异常场景。', optimizationOutcome: '异常咨询可正确转交人工处理。',
    submittedAt: '2026-09-15T09:00:00+08:00', expectedLaunchDate: '2026-09-30', code: 'XQ-2026-0101' }
  db.demands.push(demand)
  const optimization = { ...structuredClone(parent), id: 'preview-optimization', name: 'testtest',
    code: 'YH-2026-0001', parentProjectId: parent.id, demandId: demand.id, priority: 'P1' as const,
    status: 'active' as const, simpleStatus: 'in-progress' as const, overallProgress: 50,
    acceptanceStatus: 'none' as const, actualCompletedAt: null,
    createdAt: '2026-09-15T09:00:00+08:00', lastOverallUpdatedAt: '2026-09-15T12:00:00+08:00',
    originalLaunchDate: '2026-09-18', expectedLaunchDate:'2026-09-18',
    originalDeliveryDate:'2026-09-18', expectedDeliveryDate:'2026-09-18', stageExpectedDate:'2026-09-18',
    stagePlans: [{stage:'验收交付' as const,startDate:'2026-09-15',endDate:'2026-09-18'}] }
  db.projects.unshift(optimization)
  db.stageHistories.push({projectId: optimization.id, stage:'验收交付', startedAt:'2026-09-15T09:00:00+08:00',completedAt:null})
  Object.assign(db.demands[0], { name:'系统铺货信息拉通', submittedAt:'2026-09-10T10:30:00+08:00' })
  db.demands.push({ ...structuredClone(demand), id:'preview-pending-optimization', code:'XQ-2026-0102', name:'客服回复规则优化', status:'pending', submittedAt:'2026-09-11T14:20:00+08:00' })
  db.demands.push({ ...structuredClone(db.demands[0]), id:'preview-pending-formal', code:'XQ-2026-0103', name:'报关资料智能核对系统', submittedAt:'2026-09-14T16:00:00+08:00' })
  const riskProject = db.projects.find(p => p.id === 'P-2026-006')!
  Object.assign(riskProject, {name:'4个平台的日报（第一期）', code:'XM-2026-0002', simpleStatus:'blocked', blocker:'平台接口受限，部分数据暂无法获取',expectedDeliveryDate:'2026-09-10'})
  const acceptance = db.projects.find(p => p.id === 'P-2026-004')!
  Object.assign(acceptance, {code:'XM-2026-0003', stage:'验收交付', acceptanceStatus:'pending', acceptanceOwnerId:db.users[0].id, acceptanceSubmittedAt:'2026-09-14T15:00:00+08:00', acceptanceSummary:'指标计算与展示已完成，请确认交付结果。', stageExpectedDate:'2026-09-18', expectedDeliveryDate:'2026-09-18', expectedLaunchDate:'2026-09-18'})
  db.projectProposals = [{id:'preview-followup',requestId:'preview-followup',version:1,name:'采购对账流程优化评估',department:'采购中心',demandId:null,priority:'P2',primaryOwnerId:db.users[3].id,collaboratorIds:[],approvedLaunchDate:'2026-09-30',status:'pending',reviewReason:'',createdBy:db.users[0].id,createdAt:'2026-09-14T09:00:00+08:00',updatedAt:'2026-09-14T09:00:00+08:00',projectId:null}]
}
