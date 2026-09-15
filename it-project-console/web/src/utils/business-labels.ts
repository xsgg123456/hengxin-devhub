import { PROJECT_STAGES } from '@/domain/prototype'

export function stageLabel(value: unknown) {
  return PROJECT_STAGES.some(stage => stage === value) ? String(value) : '未知环节'
}

export function scheduleFieldLabel(field: string) {
  const labels: Record<string, string> = {
    stageExpectedDate: '阶段预计完成', approvedLaunchDate: '审批确认上线日期',
    expectedLaunchDate: '预计上线', expectedDeliveryDate: '预计交付',
    originalLaunchDate: '原计划上线', originalDeliveryDate: '原计划交付'
  }
  if (labels[field]) return labels[field]
  const match = /^stage:(.+):(startDate|endDate)$/.exec(field)
  if (match && PROJECT_STAGES.some(stage => stage === match[1]))
    return `${match[1]}计划${match[2] === 'startDate' ? '开始' : '结束'}`
  return '日期调整'
}

export function businessError(message: unknown, fallback = '操作失败，请稍后重试') {
  return typeof message === 'string' && /[\u3400-\u9fff]/.test(message) ? message : fallback
}
