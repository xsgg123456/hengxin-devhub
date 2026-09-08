import type { Prisma, Project } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'
import type { ProgressInput } from './progress-schemas.js'
export type ProjectChanged = (tx: Prisma.TransactionClient, id: string) => Promise<void>
export const unchanged: ProjectChanged = async () => {}
export function invalid(message: string): never { throw new AppError(400, 'INVALID_PROGRESS', message) }
export async function lockedProject(tx: Prisma.TransactionClient, id: string, version: number) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id} FOR UPDATE`
  const project = await tx.project.findUnique({ where: { id }, include: { members: true } })
  if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', '项目不存在')
  if (project.version !== version) throw new AppError(409, 'VERSION_CONFLICT', '记录已更新，请刷新后重试')
  return project
}
export function writable(project: Project) {
  if (project.status !== 'ACTIVE' || project.archived) throw new AppError(409, 'PROJECT_READONLY', '当前项目只读，请先重新打开')
}
export function projectState(project: Project) {
  return { status: project.status.toLowerCase(), archived: project.archived, stage: project.stage,
    simpleStatus: project.simpleStatus, overallProgress: project.overallProgress }
}
export async function scheduleChanges(tx: Prisma.TransactionClient, project: Project,
  input: Pick<ProgressInput, 'stageExpectedDate' | 'expectedLaunchDate' | 'expectedDeliveryDate' | 'changeReason' | 'changeDescription'>,
  authorId: string) {
  const fields = { stageExpectedDate: 'stageExpectedDate', expectedLaunchDate: 'currentLaunchDate', expectedDeliveryDate: 'currentDeliveryDate' } as const
  const data: Prisma.ProjectUpdateInput = {}
  for (const field of Object.keys(fields) as Array<keyof typeof fields>) {
    const column = fields[field], oldValue = project[column]?.toISOString().slice(0, 10) ?? ''
    const newValue = input[field] ?? oldValue
    if (!newValue) invalid('请填写阶段及计划日期')
    if (newValue === oldValue) continue
    if (!input.changeReason || !input.changeDescription) invalid('日期修改须填写调整原因和说明')
    await tx.scheduleChange.create({ data: { projectId: project.id, authorId, field,
      oldValue, newValue, reason: input.changeReason, description: input.changeDescription } })
    data[column] = new Date(newValue)
  }
  return data
}
export async function enterStage(tx: Prisma.TransactionClient, projectId: string, stage: string, now: Date, expectedDate: Date | null) {
  // Future placeholders are not episodes. Consume only untouched placeholders; never overwrite history.
  const future = await tx.stageHistory.findFirst({ where: { projectId, stage, status: 'future', enteredAt: null } })
  const data = { stage, status: 'current', enteredAt: now, expectedDate }
  if (future) await tx.stageHistory.update({ where: { id: future.id }, data })
  else await tx.stageHistory.create({ data: { projectId, ...data } })
}
