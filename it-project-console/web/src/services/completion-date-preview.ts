import type { DemoProject, ProjectStage, PrototypeSnapshot } from '@/domain/prototype'
import { PROJECT_STAGES } from '@/domain/prototype'
import { canApproveProjects } from '@/utils/project-approver'
import { assertWrite, dateValue, shanghaiDay, textValue } from './workflow-validation'

interface CompletionDateChangeInput {
  stage: ProjectStage
  completedOn: string
}

interface CompletionDateSaveInput {
  projectId: string
  version: number
  dates: CompletionDateChangeInput[]
  reason: string
}

const validDate = (value: string) => value && value !== ''

export function saveCompletionDatesPreview(snapshot: PrototypeSnapshot, input: CompletionDateSaveInput) {
  const actor = assertWrite(snapshot)
  if (!canApproveProjects(actor)) throw new Error('仅指定管理人员可以修改节点实际完成日期')
  const project = snapshot.database.projects.find(row => row.id === input.projectId)
  if (!project) throw new Error('项目已移除，请关闭后刷新')
  if ((project.version ?? 1) !== input.version) throw new Error('项目已被其他操作更新，请关闭后刷新')
  const reason = textValue(input.reason, '实际完成日期修改原因')
  const stages = project.parentProjectId ? (['验收交付'] as const) : PROJECT_STAGES
  const currentIndex = PROJECT_STAGES.indexOf(project.stage)
  if (new Set(input.dates.map(item => item.stage)).size !== input.dates.length)
    throw new Error('同一环节不能重复提交')
  const histories = snapshot.database.stageHistories.filter(row => row.projectId === project.id)
  const latest = (stage: ProjectStage) => histories.filter(row => row.stage === stage).at(-1)
  const dates = new Map<string, string>()
  for (const stage of stages) {
    const history = latest(stage)
    if (history?.completedAt && validDate(history.completedAt) && !history.interruptedAt)
      dates.set(stage, shanghaiDay(history.completedAt))
  }
  if (!dates.has('验收交付') && project.status === 'completed' && project.actualCompletedAt)
    dates.set('验收交付', shanghaiDay(project.actualCompletedAt))
  const originalDates = new Map(dates)
  const today = shanghaiDay(new Date().toISOString())
  const changes = input.dates.filter(item => {
    const index = PROJECT_STAGES.indexOf(item.stage)
    if (project.parentProjectId && item.stage !== '验收交付') throw new Error('项目优化只有优化完成验收节点')
    if (index >= currentIndex && !(project.status === 'completed' && index === currentIndex))
      throw new Error(`${item.stage}尚未按流程完成，不能直接补录实际完成日期`)
    dateValue(item.completedOn, `${item.stage}实际完成日期`)
    if (item.completedOn > today) throw new Error('实际完成日期不能晚于今天')
    if (project.firstRequestedOn && item.completedOn < project.firstRequestedOn)
      throw new Error('实际完成日期不能早于需求首次提出日期')
    const history = latest(item.stage)
    if (history?.interruptedAt) throw new Error(`${item.stage}的最新记录已纠正离开，请先按流程恢复后再修改`)
    if (history?.startedAt && !history.completedAt) throw new Error(`${item.stage}尚未按流程完成，不能直接补录实际完成日期`)
    const oldValue = originalDates.get(item.stage) ?? ''
    dates.set(item.stage, item.completedOn)
    return oldValue !== item.completedOn
  })
  let previous: { stage: string; date: string } | undefined
  for (const stage of stages) {
    const date = dates.get(stage)
    if (!date) continue
    if (previous && date < previous.date) throw new Error(`${stage}实际完成日期不能早于${previous.stage}`)
    previous = { stage, date }
  }
  if (!changes.length) return
  const now = new Date().toISOString()
  for (const change of changes) {
    const row = latest(change.stage)
    const oldValue = originalDates.get(change.stage) ?? ''
    if (row) row.completedAt = change.completedOn + 'T00:00:00.000Z'
    else snapshot.database.stageHistories.push({ projectId: project.id, stage: change.stage, startedAt: '', completedAt: change.completedOn + 'T00:00:00.000Z' })
    snapshot.database.completionDateChanges ??= []
    snapshot.database.completionDateChanges.push({
      id: crypto.randomUUID(), projectId: project.id, stage: change.stage,
      oldValue, newValue: change.completedOn, reason, authorId: actor.id, createdAt: now
    })
    if (change.stage === '验收交付' && project.status === 'completed') project.actualCompletedAt = change.completedOn + 'T00:00:00.000Z'
  }
  project.version = (project.version ?? 1) + 1
  project.updatedAt = now
}
