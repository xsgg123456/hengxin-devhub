import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './api-client'
import {
  actionLiveProject,
  correctLiveProject,
  toCorrectionInput,
  updateLiveProgress
} from './live-project-service'
import { liveOperationKey } from './live-demand-service'
vi.mock('./api-client', () => ({ apiRequest: vi.fn() }))
const api = vi.mocked(apiRequest)
describe('真实项目命令', () => {
  beforeEach(() => vi.resetAllMocks())
  it('个人提交不混入整体字段或客户端时间，版本和幂等键重试保持一致', async () => {
    const input = {
      projectId: 'p1',
      kind: 'personal' as const,
      summary: '联调完成',
      status: 'in-progress' as const,
      now: 'client-clock'
    }
    api.mockRejectedValueOnce(new Error('断网'))
    const key = liveOperationKey()
    const requestId = key(input)
    await expect(updateLiveProgress(input, 3, requestId)).rejects.toThrow('断网')
    await updateLiveProgress(input, 3, key(input))
    expect(api.mock.calls[0]).toEqual(api.mock.calls[1])
    expect(api).toHaveBeenLastCalledWith('/projects/p1/progress', {
      method: 'POST',
      body: {
        kind: 'personal',
        summary: '联调完成',
        status: 'in-progress',
        version: 3,
        requestId
      }
    })
  })
  it('纠正请求不携带进度专属kind、summary、nextStageExpectedDate', async () => {
    const correction = toCorrectionInput(
      {
        projectId: 'p1',
        kind: 'overall',
        summary: '修正阶段',
        overallProgress: 30,
        nextStageExpectedDate: '2027-01-01'
      },
      '方案设计'
    )
    await correctLiveProject(correction, 4, 'correction-key')
    const body = api.mock.calls[0]?.[1]?.body
    expect(body).toMatchObject({
      stage: '方案设计',
      reason: '修正阶段',
      overallProgress: 30,
      version: 4,
      requestId: 'correction-key'
    })
    for (const key of ['kind', 'summary', 'projectId', 'now', 'nextStageExpectedDate'])
      expect(body).not.toHaveProperty(key)
  })
  it('删除命令使用动作端点并保留原因', async () => {
    await actionLiveProject(
      { projectId: 'p1', action: 'delete', reason: '误建', now: 'ignored' },
      2,
      'delete-key'
    )
    expect(api).toHaveBeenCalledWith('/projects/p1/action', {
      method: 'POST',
      body: { action: 'delete', reason: '误建', version: 2, requestId: 'delete-key' }
    })
  })
  it('重新打开的独立会话换键，冲突刷新版本后也换键', () => {
    const first = liveOperationKey(),
      second = liveOperationKey()
    const payload = { action: 'reopen', version: 1 }
    expect(first(payload)).not.toBe(second(payload))
    expect(first(payload)).not.toBe(first({ ...payload, version: 2 }))
  })
})
