import { canApproveProjects } from '@/utils/project-approver'
import { projectCode } from '@/utils/project-code'
import type { DemoUser, PrototypeDatabase } from '@/domain/prototype'
import { computeProjectRisks } from './risk-service'

export interface ResponsibilityTask {
  id: string
  code?: string
  name: string
  reason: string
  action:
    | 'acceptance'
    | 'confirm'
    | 'reassess'
    | 'proposal'
    | 'review'
    | 'supplement'
    | 'overall'
    | 'personal'
    | 'coordinate'
  proposalId?: string
  projectId?: string
  demandId?: string
  severity: number
  days: number
  enteredAt?: string
}

export const taskCategory = (task: ResponsibilityTask) =>
  ['review', 'reassess'].includes(task.action) ? 'approval' : task.action === 'proposal' ? 'followup' : task.action === 'coordinate' ? 'risk' : 'other'

export function compareTasks(a: ResponsibilityTask, b: ResponsibilityTask, manager: boolean) {
  if (manager) {
    const rank = { approval: 0, other: 1, risk: 2, followup: 3 }
    const category = taskCategory(a), order = rank[category] - rank[taskCategory(b)]
    if (order) return order
    if (category !== 'risk') {
      const time = (task: ResponsibilityTask) => task.enteredAt && Number.isFinite(Date.parse(task.enteredAt)) ? Date.parse(task.enteredAt) : Infinity
      return time(a) - time(b) || a.id.localeCompare(b.id)
    }
  }
  return a.severity - b.severity || b.days - a.days || a.id.localeCompare(b.id)
}

export function responsibilityTasks(
  db: PrototypeDatabase,
  user: DemoUser,
  now = new Date().toISOString()
): ResponsibilityTask[] {
  const tasks: ResponsibilityTask[] = []
  for (const p of db.projectProposals ?? []) {
    if (p.status === 'confirmed') continue
    const confirm = user.id === p.primaryOwnerId && p.status === 'pending'
    const manage = canApproveProjects(user)
    if (confirm || manage)
      tasks.push({
        id: p.id,
        proposalId: p.id,
        enteredAt: p.status === 'returned' ? p.updatedAt : p.createdAt,
        name: p.name,
        reason:
          p.status === 'returned' ? '工程师退回管理评估：' + p.reviewReason : '待主负责工程师确认',
        action: confirm ? 'confirm' : p.status === 'returned' ? 'reassess' : 'proposal',
        severity: 4,
        days: 0
      })
  }
  for (const d of db.demands) {
    if (
      canApproveProjects(user) &&
      d.status === 'pending' &&
      !(db.projectProposals ?? []).some((p) => p.demandId === d.id && p.status === 'returned')
    ) {
      tasks.push({
        id: d.id,
        demandId: d.id,
        enteredAt: d.submittedAt,
        name: d.name,
        reason: '需求待评估',
        action: 'review',
        severity: 4,
        days: 0
      })
    } else if (d.submitterId === user.id && d.status === 'returned') {
      tasks.push({
        id: d.id,
        demandId: d.id,
        name: d.name,
        reason: d.reviewReason || '材料需要补充',
        action: 'supplement',
        enteredAt: d.reviewedAt || d.submittedAt,
        severity: 4,
        days: 0
      })
    }
  }
  for (const p of db.projects) {
    if (
      p.status === 'active' &&
      !p.archived &&
      p.acceptanceStatus === 'pending' &&
      p.acceptanceOwnerId === user.id
    )
      tasks.push({
        id: p.id,
        projectId: p.id,
        code: projectCode(p),
        name: p.name,
        reason: '待我验收：请确认交付结果',
        action: 'acceptance',
        enteredAt: p.acceptanceSubmittedAt || p.updatedAt,
        severity: 3,
        days: 0
      })
  }
  if (user.role === 'business') return tasks
  for (const p of db.projects) {
    if (p.status !== 'active' || p.archived) continue
    if (p.acceptanceStatus === 'pending' && (user.role === 'engineer' || p.acceptanceOwnerId === user.id)) continue
    const allRisks =
      p.riskVersion !== undefined ? p.risks : computeProjectRisks(p, db.scheduleChanges, now)
    const risks = user.role === 'manager' ? allRisks.filter(r => !r.includes('存在日期调整历史')) : allRisks
    const delay = risks.filter((r) => r.includes('延期'))
    const stale = risks.filter((r) => r.includes('未更新'))
    const severity = delay.length
      ? 0
      : p.simpleStatus === 'blocked'
        ? 1
        : stale.length
          ? 2
          : risks.some((r) => r.includes('临期'))
            ? 3
            : 5
    if (user.role === 'manager' && risks.length === 0) continue
    const primary = p.primaryOwnerId === user.id
    if (user.role === 'engineer' && primary && p.acceptanceStatus === 'returned') {
      tasks.push({
        id: p.id,
        projectId: p.id,
        code: projectCode(p),
        name: p.name,
        reason: '业务退回整改，请整改后提交验收',
        action: 'overall',
        severity: 1,
        days: 0
      })
      continue
    }
    if (user.role === 'engineer' && !primary && !p.collaboratorIds.includes(user.id)) continue
    // A healthy primary project is not a mandatory daily reporting task.
    if (user.role === 'engineer' && primary && !risks.length) continue
    const ranked = severity === 0 ? delay : severity === 2 ? stale : []
    const days = Math.max(0, ...ranked.map((r) => Number(r.match(/\d+/)?.[0] ?? 0)))
    tasks.push({
      id: p.id,
      code: projectCode(p),
      projectId: p.id,
      name: p.name,
      reason: risks.join('；') || '参与项目，可按实际进展补充协作记录',
      action: user.role === 'manager' ? 'coordinate' : primary ? 'overall' : 'personal',
      severity,
      days
    })
  }
  return tasks.sort((a, b) => compareTasks(a, b, user.role === 'manager'))
}

export function filterPendingTasks(
  tasks: ResponsibilityTask[],
  db: PrototypeDatabase,
  userId: string,
  scope: string,
  department: string,
  projectType = ''
) {
  return tasks.filter((task) => {
    if (task.proposalId) {
      const p = db.projectProposals?.find((p) => p.id === task.proposalId)
      if (!p) return false
      const demand = db.demands.find((d) => d.id === p.demandId)
      return (
        (!projectType || (projectType === 'optimization') === !!demand?.parentProjectId) &&
        (!department || p.department === department) &&
        (scope !== 'mine' ||
          (demand
            ? demand.submitterId === userId
            : p.primaryOwnerId === userId || p.createdBy === userId))
      )
    }
    const demand =
      task.action === 'review' ? db.demands.find((d) => d.id === task.demandId) : undefined
    return (
      !!demand &&
      (!projectType || (projectType === 'optimization') === !!demand.parentProjectId) &&
      (!department || demand.department === department) &&
      (scope !== 'mine' || demand.submitterId === userId)
    )
  })
}
