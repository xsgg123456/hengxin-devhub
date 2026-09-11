import { expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { demandCompletion } from './demand-completion'
it('原型验收完成结果按最新计划和上海日期判定，缺日期不伪造', () => {
  const project = createInitialPrototypeSnapshot().database.projects[0]
  project.status = 'completed'
  project.expectedDeliveryDate = '2026-09-20'
  project.actualCompletedAt = '2026-09-20T16:00:00Z'
  expect(demandCompletion(project).completionStatus).toBe('late')
  project.expectedDeliveryDate = '2026-09-21'
  expect(demandCompletion(project).completionStatus).toBe('normal')
  project.actualCompletedAt = undefined
  expect(demandCompletion(project).completionStatus).toBe('unknown')
  project.status = 'active'
  expect(demandCompletion(project).completionStatus).toBe('unfinished')
})
