import type { DemoAttachment, PrototypeSnapshot } from '@/domain/prototype'
import { nextDemandCode } from '@/utils/demand-code'
import {
  assertWrite,
  dateValue,
  nextId,
  shanghaiDay,
  textValue,
  validateMaterials,
  WorkflowError
} from './workflow-validation'
import { demandMaterials } from './demand-materials'
export interface DemandInput {
  parentProjectId?: string | null
  optimizationOutcome?: string
  attachments?: DemoAttachment[]
  id?: string
  requestId: string
  name: string
  description: string
  expectedLaunchDate: string
  prd: DemoAttachment | null
  prototype: DemoAttachment | null
  submit: boolean
  now?: string
}
export function saveDemand(snapshot: PrototypeSnapshot, input: DemandInput) {
  const actor = assertWrite(snapshot)
  const now = input.now ?? new Date().toISOString()
  const requestId = textValue(input.requestId, '请求编号')
  const existing = input.id
    ? snapshot.database.demands.find((row) => row.id === input.id)
    : undefined
  if (input.id && !existing) throw new WorkflowError('需求不存在')
  if (existing && existing.submitterId !== actor.id) throw new WorkflowError('只能维护本人需求')
  const repeated = snapshot.database.demands.find(
    (row) => row.requestId === requestId && row.submitterId === actor.id
  )
  if (repeated && (!existing || repeated.id !== existing.id)) return repeated
  if (existing && !['draft', 'pending', 'returned', 'withdrawn'].includes(existing.status))
    throw new WorkflowError('当前需求不可编辑')
  if (
    existing &&
    snapshot.database.projectProposals?.some(
      (p) => p.demandId === existing.id && p.status !== 'confirmed'
    )
  )
    throw new WorkflowError('需求已进入工程师接单流程，不可编辑')
  const parentProjectId = input.parentProjectId === undefined ? (existing?.parentProjectId ?? null) : input.parentProjectId
  if (existing && existing.status !== 'draft' && parentProjectId !== (existing.parentProjectId ?? null))
    throw new WorkflowError('提交后不可更换原项目')
  if (parentProjectId) {
    const parent = snapshot.database.projects.find(p => p.id === parentProjectId)
    if (!parent || parent.status !== 'completed' || parent.parentProjectId)
      throw new WorkflowError('仅已完成主项目可以提出优化需求')
  }
  const requiresMaterials = input.submit || existing?.status === 'pending'
  const optimizationOutcome = parentProjectId && requiresMaterials
    ? textValue(input.optimizationOutcome ?? '', '期望效果 / 验收标准')
    : (input.optimizationOutcome ?? '').trim()
  if (optimizationOutcome.length > 300) throw new WorkflowError('验收标准最多 300 字')
  const name = requiresMaterials ? textValue(input.name, '项目名称', 100) : input.name.trim()
  const description = requiresMaterials
    ? textValue(input.description, '项目说明')
    : input.description.trim()
  if (name.length > 100 || description.length > 300)
    throw new WorkflowError('项目名称或说明超出字数限制')
  if (requiresMaterials || input.expectedLaunchDate) dateValue(input.expectedLaunchDate, '期望上线日期')
  if (requiresMaterials && input.expectedLaunchDate < shanghaiDay(now))
    throw new WorkflowError('期望上线日期不得早于提交日')
  // Legacy prototype drafts stored a synthetic submittedAt; only submitted demands can use it.
  const neverSubmitted = !existing || existing.status === 'draft'
  const firstRequestedOn = neverSubmitted
    ? (input.submit ? shanghaiDay(now) : '')
    : existing.firstRequestedOn || (input.submit ? shanghaiDay(existing.submittedAt || now) : '')
  const materials = input.attachments ?? demandMaterials(input)
  validateMaterials(materials, !parentProjectId && requiresMaterials)
  const demand = {
    code:
      existing?.code ??
      nextDemandCode(snapshot.database, existing?.createdAt || existing?.submittedAt || now),
    createdAt: existing?.createdAt || existing?.submittedAt || now,
    id:
      existing?.id ??
      nextId(
        'D',
        snapshot.database.demands,
        snapshot.database.lifecycleEvents
          .filter((e) => e.entityType === 'demand')
          .map((e) => e.entityId)
      ),
    requestId,
    parentProjectId,
    optimizationOutcome,
    name,
    description,
    department: actor.department,
    submitterId: actor.id,
    firstRequestedOn,
    expectedLaunchDate: input.expectedLaunchDate,
    attachments: structuredClone(materials),
    prd: structuredClone(input.prd),
    prototype: structuredClone(input.prototype),
    status: input.submit ? ('pending' as const) : (existing?.status ?? ('draft' as const)),
    reviewReason: existing?.reviewReason ?? '',
    submittedAt: input.submit ? now : (existing?.submittedAt ?? '')
  }
  if (existing) Object.assign(existing, demand)
  else snapshot.database.demands.unshift(demand)
  return existing ?? demand
}
