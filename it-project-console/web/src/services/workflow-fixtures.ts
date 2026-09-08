import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import type { DemandInput, ProjectInput } from './workflow-service'
export const now = '2026-09-08T09:00:00+08:00'
export const demandInput: DemandInput = {
  requestId: 'submit-one',
  name: ' 测试需求 ',
  description: '解决重复录入',
  expectedLaunchDate: '2026-12-01',
  prd: { kind: 'link', name: 'PRD', url: 'https://example.com/prd', status: 'ready' },
  prototype: { kind: 'file', name: 'demo.html', size: 100, status: 'ready' },
  submit: true,
  now
}
export const projectInput: ProjectInput = {
  requestId: 'project-one',
  name: '测试项目',
  department: '市场部',
  primaryOwnerId: 'user-engineer-wang',
  collaboratorIds: ['user-engineer-zhao'],
  priority: 'P1',
  expectedLaunchDate: '2026-09-20',
  expectedDeliveryDate: '2026-10-01',
  stageExpectedDate: '2026-09-09',
  now
}
export function fresh() {
  const snapshot = createInitialPrototypeSnapshot()
  snapshot.activeUserId = 'user-business-li'
  return snapshot
}
