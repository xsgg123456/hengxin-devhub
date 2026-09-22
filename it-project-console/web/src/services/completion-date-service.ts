import type { DemoProject, DemoStageHistory, ProjectStage } from '@/domain/prototype'
import { PROJECT_STAGES } from '@/domain/prototype'
import { shanghaiDay } from './workflow-validation'
import { stageExecutions } from './stage-execution'

export interface CompletionDateRow {
  stage: ProjectStage
  label: string
  actualDate: string
  editable: boolean
  blockedReason: string
}

export function completionDateRows(
  project: DemoProject,
  histories: DemoStageHistory[],
  today = shanghaiDay(new Date().toISOString())
): CompletionDateRow[] {
  const stages = project.parentProjectId ? (['验收交付'] as const) : PROJECT_STAGES
  const currentIndex = PROJECT_STAGES.indexOf(project.stage)
  const executions = stageExecutions(project, histories, today)
  return stages.map(stage => {
    const execution = executions.find(item => item.stage === stage)
    const stageHistories = histories.filter(history => history.projectId === project.id && history.stage === stage)
    const latest = stageHistories.at(-1)
    const index = PROJECT_STAGES.indexOf(stage)
    const passed = index < currentIndex || (project.status === 'completed' && index === currentIndex)
    const actualDate = execution?.completedAt
      ? shanghaiDay(execution.completedAt)
      : stage === '验收交付' && project.status === 'completed' && project.actualCompletedAt
        ? shanghaiDay(project.actualCompletedAt)
        : ''
    return {
      stage,
      label: project.parentProjectId ? '优化完成验收' : stage,
      actualDate,
      editable: passed && !latest?.interruptedAt && !(latest?.startedAt && !latest.completedAt),
      blockedReason: latest?.interruptedAt
        ? '最新记录已纠正离开'
        : latest?.startedAt && !latest.completedAt
          ? '最新记录尚未完成'
          : ''
    }
  })
}
