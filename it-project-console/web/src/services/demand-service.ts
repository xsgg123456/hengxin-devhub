import type { DemoAttachment, PrototypeSnapshot } from '@/domain/prototype'
import {
  assertWrite,
  dateValue,
  nextId,
  shanghaiDay,
  textValue,
  validateAttachment,
  WorkflowError
} from './workflow-validation'
export interface DemandInput {
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
  const name = input.submit ? textValue(input.name, '项目名称', 100) : input.name.trim()
  const description = input.submit
    ? textValue(input.description, '项目说明')
    : input.description.trim()
  if (name.length > 100 || description.length > 300)
    throw new WorkflowError('项目名称或说明超出字数限制')
  if (input.submit || input.expectedLaunchDate) dateValue(input.expectedLaunchDate, '期望上线日期')
  if (input.submit && input.expectedLaunchDate < shanghaiDay(now))
    throw new WorkflowError('期望上线日期不得早于提交日')
  validateAttachment(input.prd, 'prd', input.submit)
  validateAttachment(input.prototype, 'prototype', input.submit)
  if ((input.prd?.size ?? 0) + (input.prototype?.size ?? 0) > 50 * 1024 * 1024)
    throw new WorkflowError('单需求附件合计不得超过 50 MB')
  const demand = {
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
    name,
    description,
    department: actor.department,
    submitterId: actor.id,
    expectedLaunchDate: input.expectedLaunchDate,
    prd: structuredClone(input.prd),
    prototype: structuredClone(input.prototype),
    status: input.submit ? ('pending' as const) : ('draft' as const),
    reviewReason: existing?.reviewReason ?? '',
    submittedAt: input.submit ? now : (existing?.submittedAt ?? now)
  }
  if (existing) Object.assign(existing, demand)
  else snapshot.database.demands.unshift(demand)
  return existing ?? demand
}
