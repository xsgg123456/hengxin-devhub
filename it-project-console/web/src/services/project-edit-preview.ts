import { PROJECT_STAGES, type DemoProject, type PrototypeSnapshot } from '@/domain/prototype'
import { runtimeConfig } from '@/config/runtime'
import { canEditProject, isMigrationPending } from '@/utils/project-edit-permission'
import { isEngineerEligible } from '@/utils/engineer-eligibility'
import { assertWrite, dateValue, shanghaiDay } from './workflow-validation'
import { recordLifecycle } from './lifecycle-service'
import { deliveryHref } from '@/utils/delivery-url'

export { isMigrationPending } from '@/utils/project-edit-permission'

export function saveProjectEditPreview(
  snapshot: PrototypeSnapshot,
  edited: DemoProject,
  baseline: string,
  reason: string,
  verify: boolean
) {
  const actor = assertWrite(snapshot)
  const current = snapshot.database.projects.find((p) => p.id === edited.id)
  if (!current) throw new Error('项目已移除，请关闭后刷新')
  if (!runtimeConfig.isPrototype || !canEditProject(actor, current))
    throw new Error('当前无完整编辑权限：仅指定管理员或迁移待核实项目的主负责工程师可编辑')
  const wasPending = isMigrationPending(current)
  if (JSON.stringify(current) !== baseline)
    throw new Error('项目已被其他操作更新，请关闭并重新打开编辑')
  if (!edited.name.trim() || !edited.department.trim())
    throw new Error('请填写项目名称和需求部门（基本资料）')
  if (deliveryHref(edited.acceptanceUrl ?? '') === null) throw new Error('交付链接格式不正确')
  const firstRequestedOn = edited.firstRequestedOn || ''
  if (firstRequestedOn) {
    dateValue(firstRequestedOn, '需求首次提出日期')
    if (firstRequestedOn > shanghaiDay(new Date().toISOString())) throw new Error('需求首次提出日期不能晚于今天')
  }
  if (verify && !firstRequestedOn) throw new Error('完成核实前，请补齐需求首次提出日期（基本资料）')
  for (const key of ['originalLaunchDate', 'originalDeliveryDate', 'expectedLaunchDate', 'expectedDeliveryDate'] as const) { if (edited[key]) dateValue(edited[key], key); else edited[key] = '' }
  const engineers = snapshot.database.users.filter(isEngineerEligible).map((u) => u.id)
  if (!engineers.includes(edited.primaryOwnerId))
    throw new Error('请选择有效主负责工程师（人员关联）')
  if (
    edited.collaboratorIds.includes(edited.primaryOwnerId) ||
    edited.collaboratorIds.some((id) => !engineers.includes(id))
  )
    throw new Error('协作人员必须有效且不能与主负责人重复')
  for (const id of [edited.businessOwnerId, edited.acceptanceOwnerId]) {
    if (id && !snapshot.database.users.some((u) => u.id === id))
      throw new Error('请选择有效业务人员')
  }
  if (edited.acceptanceOwnerId && !snapshot.database.users.some(u => u.id === edited.acceptanceOwnerId && u.role === 'business')) throw new Error('验收人必须为业务人员')
  if (edited.simpleStatus === 'blocked' && !edited.blocker.trim())
    throw new Error('请填写阻塞说明（阶段与日期）')
  if (edited.simpleStatus === 'completed' && current.simpleStatus !== 'completed')
    throw new Error('业务验收结果请通过原验收入口处理')
  if (current.acceptanceStatus === 'pending' && ['stage', 'simpleStatus', 'acceptanceUrl', 'acceptanceSummary'].some(key => edited[key as keyof DemoProject] !== current[key as keyof DemoProject]))
    throw new Error('项目正在业务验收，请先撤回验收后调整阶段、状态或交付材料')
  for (const plan of edited.stagePlans ?? []) {
    if (plan.startDate) dateValue(plan.startDate, `${plan.stage}计划开始`)
    if (plan.endDate) dateValue(plan.endDate, `${plan.stage}计划结束`)
    if (
      Boolean(plan.startDate) !== Boolean(plan.endDate) ||
      (plan.startDate && plan.startDate > plan.endDate)
    )
      throw new Error(`${plan.stage}的计划开始和结束日期不完整或顺序错误`)
  }
  if (
    edited.expectedLaunchDate &&
    edited.expectedDeliveryDate &&
    edited.expectedLaunchDate > edited.expectedDeliveryDate
  )
    throw new Error('预计交付不能早于预计上线')
  if (
    verify &&
    (!edited.businessOwnerId ||
      !edited.acceptanceOwnerId ||
      !edited.expectedLaunchDate ||
      !edited.expectedDeliveryDate)
  )
    throw new Error('完成核实前，请补齐业务负责人、验收人、预计上线和交付日期')
  if (!reason.trim()) throw new Error('请填写本次修改原因')
  const progressChanged = edited.stage !== current.stage || edited.simpleStatus !== current.simpleStatus || edited.blocker !== current.blocker
  const retainedStageDate = edited.stage === current.stage && !current.stagePlans?.some(plan => plan.stage === current.stage && plan.endDate) ? current.stageExpectedDate : ''
  const before = {
    name: current.name,
    primaryOwnerId: current.primaryOwnerId,
    stage: current.stage,
    details: JSON.stringify(current)
  }
  const now = new Date().toISOString()
  for (const key of ['expectedLaunchDate', 'expectedDeliveryDate'] as const) {
    if (current[key] && edited[key] && current[key] !== edited[key]) snapshot.database.scheduleChanges.push({ id: crypto.randomUUID(), projectId: current.id, field: key, oldValue: current[key], newValue: edited[key], reason: '其他', description: reason.trim(), authorId: actor.id, createdAt: now })
  }
  for (const plan of edited.stagePlans ?? []) {
    const old = current.stagePlans?.find(p => p.stage === plan.stage)
    if (!old) continue
    for (const key of ['startDate', 'endDate'] as const) {
      if (plan[key] && plan[key] !== old[key]) snapshot.database.scheduleChanges.push({ id: crypto.randomUUID(), projectId: current.id, field: `stage:${plan.stage}:${key}`, oldValue: old[key], newValue: plan[key], reason: '其他', description: reason.trim(), authorId: actor.id, createdAt: now })
    }
  }
  const editable = [
    'name',
    'department',
    'priority',
    'description',
    'businessOwnerId',
    'acceptanceOwnerId',
    'primaryOwnerId',
    'collaboratorIds',
    'stage',
    'simpleStatus',
    'blocker',
    'stagePlans',
    'originalLaunchDate',
    'originalDeliveryDate',
    'expectedLaunchDate',
    'expectedDeliveryDate',
    'approvedLaunchDate',
    'acceptanceUrl',
    'acceptanceSummary'
  ] as const
  for (const key of editable) Object.assign(current, { [key]: edited[key] })
  current.firstRequestedOn = firstRequestedOn
  const demand = snapshot.database.demands.find(d => d.id === current.demandId)
  if (demand) demand.firstRequestedOn = firstRequestedOn
  current.stagePlans = current.stagePlans?.filter(p => p.startDate && p.endDate)
  current.name = current.name.trim()
  if (wasPending && !verify) {
    current.migrationVerified = false
    if (!current.name.startsWith('【迁移待核实】')) current.name = '【迁移待核实】' + current.name
  }
  if (verify) {
    current.migrationVerified = true
    current.name = current.name.replace(/^【迁移待核实】\s*/, '')
  }
  const index = PROJECT_STAGES.indexOf(current.stage)
  current.stageExpectedDate =
    current.stagePlans?.find((p) => p.stage === current.stage)?.endDate || retainedStageDate
  if (current.stage !== before.stage) current.overallProgress = Math.round((index / PROJECT_STAGES.length) * 100)
  if (progressChanged) current.updatedAt = now
  recordLifecycle(snapshot, {
    entityType: 'project',
    entityId: current.id,
    action: 'correct',
    createdAt: now,
    reason: reason.trim(),
    before,
    after: {
      name: current.name,
      primaryOwnerId: current.primaryOwnerId,
      stage: current.stage,
      details: JSON.stringify(current),
      migrationVerified: current.migrationVerified === true
    }
  })
}
