import type { DemoProject, ProjectStage } from '@/domain/prototype'
import { needsPlan } from '@/services/stage-plan-service'
import { shanghaiDay } from '@/services/workflow-validation'
export const projectStageLabel = (project: Pick<DemoProject, 'parentProjectId'>, stage: ProjectStage) => project.parentProjectId ? '优化完成验收' : stage
export function optimizationStatus(project: DemoProject, today = shanghaiDay(new Date().toISOString())) {
  if (project.status === 'cancelled') return '已取消'
  if (project.status === 'completed') return '优化已完成'
  if (project.acceptanceStatus === 'pending') return '待验收'
  if (project.acceptanceStatus === 'returned') return '退回整改'
  if (needsPlan(project)) return '待排期'
  const plan = project.stagePlans?.find(item => item.stage === '验收交付')
  if (project.simpleStatus === 'not-started' || (plan && plan.startDate > today)) return '待开始'
  return '优化中'
}
