import { expect, it, vi } from 'vitest'
import { ApiError } from '@/services/api-client'
import { useDemandDraftRequest } from './use-demand-draft-request'
import type { LiveDemandInput, LiveWriteResult } from '@/services/live-demand-service'

const input = (parentProjectId: string): LiveDemandInput => ({
  parentProjectId,
  name: '优化',
  description: '',
  expectedLaunchDate: '',
  prd: null,
  prototype: null
})

it('请求等待期间锁定关联且并发创建合并，同次成功后不再创建', async () => {
  let resolve!: (value: LiveWriteResult) => void
  const create = vi.fn(
    () =>
      new Promise<LiveWriteResult>((r) => {
        resolve = r
      })
  )
  const state = useDemandDraftRequest(create, 'original-key')
  const first = state.requestDraft(input('A'))
  expect(state.draftLocked.value).toBe(true)
  const second = state.requestDraft(input('B'))
  await Promise.resolve()
  expect(create).toHaveBeenCalledTimes(1)
  resolve({ id: 'draft-A', version: 1 })
  expect(await first).toEqual(await second)
  await state.requestDraft(input('B'))
  expect(create).toHaveBeenCalledTimes(1)
  expect(state.draftLocked.value).toBe(true)
})

it('明确校验失败后可改选B，重试使用新请求键及当前输入', async () => {
  const create = vi
    .fn()
    .mockRejectedValueOnce(new ApiError('只能关联已完成主项目', 400))
    .mockResolvedValueOnce({ id: 'draft-B', version: 1 })
  const state = useDemandDraftRequest(create, 'original-key')
  await expect(state.requestDraft(input('A'))).rejects.toThrow('已完成')
  expect(state.draftLocked.value).toBe(false)
  await state.requestDraft(input('B'))
  expect(create.mock.calls[1][0].parentProjectId).toBe('B')
  expect(create.mock.calls[1][1]).not.toBe('original-key')
})

it.each([0, 500, 408])('结果未知(%s)保持关联锁定并使用同一请求键和原数据恢复', async (status) => {
  const create = vi
    .fn()
    .mockRejectedValueOnce(new ApiError('重试', status))
    .mockResolvedValueOnce({ id: 'draft-A', version: 1 })
  const state = useDemandDraftRequest(create, 'original-key')
  await expect(state.requestDraft(input('A'))).rejects.toThrow()
  expect(state.draftLocked.value).toBe(true)
  await state.requestDraft(input('B'))
  expect(create.mock.calls[1]).toEqual(create.mock.calls[0])
})
