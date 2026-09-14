import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./api-client', () => ({ apiRequest: vi.fn() }))
import { apiRequest } from './api-client'
import { confirmLiveProposal, resubmitLiveProposal } from './proposal-service'
import { projectInput } from './workflow-fixtures'
beforeEach(() => vi.mocked(apiRequest).mockClear())
it('接单严格DTO不包含reason，退回DTO包含原因', async () => {
  await confirmLiveProposal('p1', 2, 'accept', '', 'a1')
  expect(apiRequest).toHaveBeenLastCalledWith('/project-proposals/p1/confirm', {
    method: 'POST',
    body: { version: 2, decision: 'accept', requestId: 'a1' }
  })
  await confirmLiveProposal('p1', 2, 'return', '调整人员', 'a2')
  expect(apiRequest).toHaveBeenLastCalledWith('/project-proposals/p1/confirm', {
    method: 'POST',
    body: { version: 2, decision: 'return', reason: '调整人员', requestId: 'a2' }
  })
})
it('重提仅发送严格允许的审批字段', async () => {
  await resubmitLiveProposal('p1', 2, { ...projectInput, now: 'ignored' })
  expect(apiRequest).toHaveBeenLastCalledWith('/project-proposals/p1/resubmit', {
    method: 'POST',
    body: {
      version: 2,
      requestId: projectInput.requestId,
      name: projectInput.name,
      department: projectInput.department,
      primaryOwnerId: projectInput.primaryOwnerId,
      collaboratorIds: projectInput.collaboratorIds,
      priority: projectInput.priority,
      approvedLaunchDate: projectInput.approvedLaunchDate
    }
  })
})
