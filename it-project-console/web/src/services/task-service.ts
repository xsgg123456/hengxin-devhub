import type { DemoUser, PrototypeDatabase } from '@/domain/prototype'
import { computeProjectRisks } from './risk-service'

export interface ResponsibilityTask {
  id: string
  name: string
  reason: string
  action: 'review' | 'supplement' | 'overall' | 'personal' | 'coordinate'
  projectId?: string
  demandId?: string
  severity: number
  days: number
}

export function responsibilityTasks(
  db: PrototypeDatabase,
  user: DemoUser,
  now = new Date().toISOString()
): ResponsibilityTask[] {
  const tasks: ResponsibilityTask[] = []
  for (const d of db.demands) {
    if (user.role === 'manager' && d.status === 'pending') {
      tasks.push({
        id: d.id,
        demandId: d.id,
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
        severity: 4,
        days: 0
      })
    }
  }
  if (user.role === 'business') return tasks
  for (const p of db.projects) {
    if (p.status !== 'active' || p.archived) continue
    const risks = computeProjectRisks(p, db.scheduleChanges, now)
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
    if (user.role === 'engineer' && !primary && !p.collaboratorIds.includes(user.id)) continue
    // A healthy primary project is not a mandatory daily reporting task.
    if (user.role === 'engineer' && primary && !risks.length) continue
    const ranked = severity === 0 ? delay : severity === 2 ? stale : []
    const days = Math.max(0, ...ranked.map((r) => Number(r.match(/\d+/)?.[0] ?? 0)))
    tasks.push({
      id: p.id,
      projectId: p.id,
      name: p.name,
      reason: risks.join('；') || '参与项目，可按实际进展补充协作记录',
      action: user.role === 'manager' ? 'coordinate' : primary ? 'overall' : 'personal',
      severity,
      days
    })
  }
  return tasks.sort(
    (a, b) => a.severity - b.severity || b.days - a.days || a.id.localeCompare(b.id)
  )
}
