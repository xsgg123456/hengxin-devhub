import { deliveryHref } from '@/utils/delivery-url'
import type {
  AcceptanceAction,
  DemoProject,
  PrototypeDatabase,
  PrototypeSnapshot
} from '@/domain/prototype'
import { assertWrite, WorkflowError } from './workflow-validation'
import { needsPlan } from './stage-plan-service'
import { computeProjectRisks } from './risk-service'
import { projectState, recordLifecycle } from './lifecycle-service'
import { apiRequest } from './api-client'
import { isEngineerEligible } from '@/utils/engineer-eligibility'

export interface AcceptanceInput {
  projectId: string
  requestId: string
  version?: number
  action: AcceptanceAction
  ownerId?: string
  summary?: string
  url?: string
  now?: string
}
export function initializeAcceptance(project: DemoProject, db: PrototypeDatabase) {
  if (project.acceptanceOwnerId === undefined) {
    const demand = db.demands.find((d) => d.id === project.demandId)
    project.acceptanceOwnerId =
      project.status === 'active'
        ? (db.users.find((u) => u.id === demand?.submitterId && u.role === 'business')?.id ?? null)
        : null
  }
  project.acceptanceStatus ??= 'none'
  project.acceptanceSubmittedAt ??= null
  project.acceptanceSummary ??= ''
  project.acceptanceUrl ??= ''
  project.acceptanceRound ??= 0
  project.acceptanceHistory ??= []
}
export function acceptanceLabel(project: DemoProject) {
  if (project.status === 'completed' && project.acceptanceStatus !== 'accepted')
    return '历史完成 / 无业务验收记录'
  return {
    none: '待提交验收',
    pending: '待业务验收',
    returned: '退回整改',
    accepted: '业务验收已通过'
  }[project.acceptanceStatus ?? 'none']
}
export function invalidateAcceptance(
  project: DemoProject,
  actorId: string,
  now: string,
  summary: string
) {
  if (project.acceptanceStatus && project.acceptanceStatus !== 'none') {
    project.acceptanceHistory ??= []
    project.acceptanceHistory.push({
      id: crypto.randomUUID(),
      action: 'invalidate',
      actorId,
      createdAt: now,
      round: project.acceptanceRound ?? 0,
      summary,
      url: '',
      ownerId: project.acceptanceOwnerId ?? null
    })
  }
  project.acceptanceStatus = 'none'
  project.acceptanceSubmittedAt = null
  project.acceptanceSummary = ''
  project.acceptanceUrl = ''
}
export function actionAcceptance(snapshot: PrototypeSnapshot, input: AcceptanceInput) {
  const actor = assertWrite(snapshot)
  const p = snapshot.database.projects.find((row) => row.id === input.projectId)
  if (!p) throw new WorkflowError('项目不存在')
  initializeAcceptance(p, snapshot.database)
  const old = p.acceptanceHistory!.find((h) => h.id === input.requestId)
  if (old) {
    if (
      old.actorId !== actor.id ||
      old.action !== input.action ||
      old.summary !== (input.summary ?? '').trim() ||
      old.url !== (input.url ?? '').trim() ||
      (input.action === 'assign' && old.ownerId !== input.ownerId)
    )
      throw new WorkflowError('请求编号已使用')
    return { id: p.id, version: p.version ?? 0 }
  }
  if (!input.requestId.trim()) throw new WorkflowError('请求编号不能为空')
  if (input.version !== (p.version ?? 0)) throw new WorkflowError('项目已更新，请刷新后重试')
  if (
    (input.action !== 'assign' && input.ownerId !== undefined) ||
    (input.action !== 'submit' && input.url !== undefined)
  )
    throw new WorkflowError('当前操作包含不适用的字段')
  if (p.status !== 'active' || p.archived) throw new WorkflowError('当前项目只读')
  const summary = (input.summary ?? '').trim(),
    url = (input.url ?? '').trim()
  if (summary.length > 2000 || url.length > 2000)
    throw new WorkflowError('说明和链接最多 2000 字符')
  if (input.action !== 'accept' && !summary) throw new WorkflowError('请填写说明或原因')
  if (deliveryHref(url) === null)
    throw new WorkflowError('请输入有效网页地址，支持HTTP/HTTPS和内网地址，请勿包含账号密码')
  const pending = p.acceptanceStatus === 'pending'
  if (input.action !== 'assign' && p.stage !== '验收交付')
    throw new WorkflowError('仅验收交付环节可操作验收')
  if (input.action === 'accept' && needsPlan(p)) throw new WorkflowError('请先制定完整计划')
  if (input.action === 'assign') {
    if (actor.role !== 'manager') throw new WorkflowError('只有管理人员可指定验收负责人')
    if (!snapshot.database.users.some((u) => u.id === input.ownerId && u.role === 'business'))
      throw new WorkflowError('请选择有效业务人员')
    if (input.ownerId === p.acceptanceOwnerId) throw new WorkflowError('验收负责人未改变')
  } else if (input.action === 'submit' || input.action === 'withdraw') {
    if (actor.role !== 'engineer' || !isEngineerEligible(actor) || actor.id !== p.primaryOwnerId)
      throw new WorkflowError('只有主负责工程师可以提交或撤回验收')
    if (input.action === 'submit') {
      if (pending) throw new WorkflowError('当前已待业务验收，请先撤回')
      if (p.stage !== '验收交付' || needsPlan(p))
        throw new WorkflowError('请先完成前序环节并制定完整计划')
      if (
        !snapshot.database.users.some((u) => u.id === p.acceptanceOwnerId && u.role === 'business')
      )
        throw new WorkflowError('请管理人员指定有效业务验收负责人')
    } else if (!pending) throw new WorkflowError('当前没有待验收提交')
  } else if (input.action === 'accept' || input.action === 'return') {
    if (actor.role !== 'business' || actor.id !== p.acceptanceOwnerId)
      throw new WorkflowError('只有指定业务验收负责人可以验收')
    if (!pending) throw new WorkflowError('当前没有待验收提交')
  } else throw new WorkflowError('验收操作无效')
  const now = input.now ?? new Date().toISOString(),
    before = projectState(p)
  if (input.action === 'assign') p.acceptanceOwnerId = input.ownerId!
  if (input.action === 'submit') {
    p.acceptanceRound!++
    p.acceptanceStatus = 'pending'
    p.acceptanceSummary = summary
    p.acceptanceUrl = url
    p.acceptanceSubmittedAt = now
    p.simpleStatus = 'in-progress'
  }
  if (input.action === 'withdraw' || input.action === 'return') {
    p.acceptanceStatus = input.action === 'return' ? 'returned' : 'none'
    p.lastOverallUpdatedAt = now
  }
  if (input.action === 'accept') {
    p.acceptanceStatus = 'accepted'
    p.status = 'completed'
    p.simpleStatus = 'completed'
    p.actualCompletedAt = now
    const history = snapshot.database.stageHistories.find(
      (h) =>
        h.projectId === p.id && h.stage === '验收交付' && h.completedAt === null && !h.interruptedAt
    )
    const plan = p.stagePlans?.find((s) => s.stage === '验收交付')
    const record = {
      completedAt: now,
      plannedStartDate: plan?.startDate ?? null,
      plannedEndDate: plan?.endDate ?? null
    }
    if (history) Object.assign(history, record)
    else
      snapshot.database.stageHistories.push({
        projectId: p.id,
        stage: '验收交付',
        startedAt: '',
        ...record
      })
    recordLifecycle(snapshot, {
      entityType: 'project',
      entityId: p.id,
      action: 'complete',
      createdAt: now,
      reason: summary,
      before,
      after: projectState(p)
    })
  }
  p.acceptanceHistory!.push({
    id: input.requestId,
    action: input.action,
    actorId: actor.id,
    createdAt: now,
    round: p.acceptanceRound!,
    summary,
    url,
    ownerId: p.acceptanceOwnerId!
  })
  p.version = (p.version ?? 0) + 1
  p.updatedAt = now
  p.risks = computeProjectRisks(p, snapshot.database.scheduleChanges, now)
  return { id: p.id, version: p.version }
}
export function actionLiveAcceptance(input: AcceptanceInput) {
  const { projectId, now: _now, ...body } = input
  return apiRequest<{ id: string; version: number }>(`/projects/${projectId}/acceptance`, {
    method: 'POST',
    body
  })
}
