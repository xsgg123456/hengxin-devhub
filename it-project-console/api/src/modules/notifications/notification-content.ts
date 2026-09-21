import { notificationProjectLabels } from './notification-project.js'

type NotificationContentItem = {
  payload: unknown
  eventType: string
  recipient: { role: string }
  recipientId: string
  projectId: string | null
  demandId: string | null
  project: { parentProjectId: string | null; stage: string; name: string; primaryOwnerId: string; primaryOwner: { name: string } } | null
  demand: { parentProjectId: string | null; name: string } | null
}

export function notificationContent(item: NotificationContentItem, origin: string) {
  const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
    ? item.payload as Record<string, unknown>
    : {}
  if (item.eventType === 'MANAGER_RISK_DIGEST') {
    const projects: unknown[] = Array.isArray(payload.projects) ? payload.projects : []
    const blocks = projects.flatMap(project => {
      if (!project || typeof project !== 'object' || Array.isArray(project)) return []
      const record = project as Record<string, unknown>
      if (typeof record.projectId !== 'string') return []
      const labels = notificationProjectLabels(typeof record.parentProjectId === 'string' ? record.parentProjectId : null,
        typeof record.stage === 'string' ? record.stage : '',
        Array.isArray(record.risks) ? record.risks.filter((risk: unknown): risk is string => typeof risk === 'string') : [])
      return [[`${labels.type}：${record.name}`, `负责人：${record.owner}`, ...(labels.stage ? [`阶段：${labels.stage}`] : []),
        ...labels.risks,
        `查看详情：${new URL(`/#/project-overview?projectId=${encodeURIComponent(record.projectId)}`, origin).href}`].join('\n')]
    })
    const overview = `查看全部：${new URL('/#/project-overview', origin).href}`
    const reserve = Buffer.byteLength(`\n其余 ${blocks.length} 个项目请点总览\n${overview}`, 'utf8')
    let content = '项目风险汇总', shown = 0
    for (const block of blocks) {
      if (Buffer.byteLength(`${content}\n${block}`, 'utf8') + reserve > 1800) break
      content += `\n${block}`
      shown++
    }
    return shown < blocks.length ? `${content}\n其余 ${blocks.length - shown} 个项目请点总览\n${overview}` : content
  }
  const title: Record<string, string> = {
    DEMAND_SUBMITTED: '新需求待立项审批，请及时处理',
    ACCEPTANCE_SUBMITTED: '项目待业务验收', ACCEPTANCE_RETURNED: '业务验收退回整改',
    PROPOSAL_ASSIGNED: '项目待确认接单', PROPOSAL_RETURNED: '工程师退回管理评估',
    PROJECT_RISKS_CHANGED: '项目风险提醒', DEMAND_RETURNED: '需求已退回',
    DEMAND_APPROVED: '需求已正式立项', PROJECT_ASSIGNED: '项目已分配', PROJECT_COMPLETED: '项目已完成'
  }
  if (item.recipient.role === 'ENGINEER' && item.project?.primaryOwnerId === item.recipientId) {
    title.DEMAND_APPROVED = '需求已正式立项，请制定计划'
    title.PROJECT_ASSIGNED = '项目已正式立项，请制定计划'
  }
  const optimization = !!(item.project?.parentProjectId ?? item.demand?.parentProjectId)
  if (optimization) {
    Object.assign(title, {
      DEMAND_SUBMITTED: '项目优化待审批，请及时处理',
      DEMAND_APPROVED: '项目优化已批准', PROJECT_ASSIGNED: '项目优化已分配',
      PROPOSAL_ASSIGNED: '项目优化待确认接单', PROPOSAL_RETURNED: '项目优化退回管理评估',
      ACCEPTANCE_SUBMITTED: '项目优化待完成验收', ACCEPTANCE_RETURNED: '项目优化验收退回整改',
      PROJECT_COMPLETED: '项目优化已完成', DEMAND_RETURNED: '项目优化需求已退回',
      PROJECT_RISKS_CHANGED: '项目优化风险提醒'
    })
    if (item.recipient.role === 'ENGINEER' && item.project?.primaryOwnerId === item.recipientId) {
      title.DEMAND_APPROVED = '项目优化已批准，请制定计划'
      title.PROJECT_ASSIGNED = '项目优化已批准，请制定计划'
    }
  }
  const risks = Array.isArray(payload.risks) ? payload.risks.filter((risk): risk is string =>
    typeof risk === 'string' && (item.recipient.role === 'MANAGER' || /临期|延期|未更新|阻塞/.test(risk))) : []
  const path = typeof payload.proposalId === 'string' ? `/#/today-tasks?proposalId=${encodeURIComponent(payload.proposalId)}` : item.projectId ? `/#/project-overview?projectId=${encodeURIComponent(item.projectId)}` :
    `/#/my-demands?demandId=${encodeURIComponent(item.demandId ?? '')}`
  return [title[item.eventType], `${optimization ? '项目优化' : '正式项目'}：${item.project?.name ?? item.demand?.name ?? payload.name ?? '需求'}`,
    item.project ? `负责人：${item.project.primaryOwner.name}` : '',
    ...notificationProjectLabels(optimization ? 'optimization' : null, item.project?.stage ?? '', risks).risks,
    typeof payload.reason === 'string' ? `原因：${payload.reason}` : '',
    `查看详情：${new URL(path, origin).href}`].filter(Boolean).join('\n')
}
