import type { DemoProject, ProjectStage } from '@/domain/prototype'
export const projectStageLabel = (project: Pick<DemoProject, 'parentProjectId'>, stage: ProjectStage) => project.parentProjectId ? '优化交付' : stage
export function optimizationStatus(project: DemoProject) {
  return project.status === 'completed' ? '已完成' : project.status === 'cancelled' ? '已取消' : project.acceptanceStatus === 'pending' ? '待验收' : '优化中'
}
