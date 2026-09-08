import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from './api-client'
import {
  liveOperationKey,
  materialDto,
  reviewLiveDemand,
  saveLiveDemand
} from './live-demand-service'
import { uploadLiveMaterial, createMaterialCleanup } from './live-material-service'
vi.mock('./api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api-client')>()),
  apiRequest: vi.fn()
}))
const api = vi.mocked(apiRequest)
describe('真实需求命令与文件适配', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllGlobals()
  })
  it('独立打开的创建表单为相同内容分配新的键', () => {
    const firstSession = liveOperationKey()
    const secondSession = liveOperationKey()
    expect(firstSession({ name: '相同项目' })).not.toBe(secondSession({ name: '相同项目' }))
  })
  it('清理只涉及本次上传，未跟踪的原有材料不删除', async () => {
    const cleanup = createMaterialCleanup()
    await cleanup.discardAll()
    expect(api).not.toHaveBeenCalled()
    cleanup.track('new')
    await cleanup.discardAll()
    expect(api).toHaveBeenCalledWith('/attachments/new', { method: 'DELETE' })
    await cleanup.discardAll()
    expect(api).toHaveBeenCalledTimes(1)
  })
  it('清理失败保留候选，用户重试可释放额度', async () => {
    const cleanup = createMaterialCleanup()
    cleanup.track('new')
    api.mockRejectedValueOnce(new Error('network'))
    await expect(cleanup.discardAll()).rejects.toThrow('network')
    await cleanup.discardAll()
    expect(api).toHaveBeenCalledTimes(2)
  })
  it('保存后服务端拒删已引用文件，清理安全结束', async () => {
    const cleanup = createMaterialCleanup()
    cleanup.track('persisted')
    api.mockRejectedValueOnce(new ApiError('材料已被引用', 409))
    await expect(cleanup.discardAll()).resolves.toBeUndefined()
    await cleanup.discardAll()
    expect(api).toHaveBeenCalledTimes(1)
  })
  it('未修改失败请求保持幂等键，修改后使用新键', () => {
    const key = liveOperationKey()
    const first = key({ name: '原文' })
    expect(key({ name: '原文' })).toBe(first)
    expect(key({ name: '改文' })).not.toBe(first)
  })
  it('正式提交只发送真实附件id，重试保留requestId与version', async () => {
    const input = {
      name: '  需求  ',
      description: '说明',
      expectedLaunchDate: '2027-01-01',
      prd: { kind: 'file' as const, name: 'prd.pdf', attachmentId: 'a1', status: 'ready' as const },
      prototype: null
    }
    await saveLiveDemand(input, 'stable', true, 'd1', 2)
    await saveLiveDemand(input, 'stable', true, 'd1', 2)
    expect(api.mock.calls[0]).toEqual(api.mock.calls[1])
    expect(api).toHaveBeenCalledWith(
      '/demands/d1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.objectContaining({
          requestId: 'stable',
          version: 2,
          name: '需求',
          prd: { kind: 'file', attachmentId: 'a1' }
        })
      })
    )
  })
  it('拒绝伪上传及失败中的文件', () => {
    expect(() => materialDto({ kind: 'file', name: 'x.pdf', status: 'ready' })).toThrow('上传')
    expect(() =>
      materialDto({ kind: 'file', name: 'x.pdf', status: 'failed', attachmentId: 'a' })
    ).toThrow('上传')
  })
  it('退回不附带立项字段，符合严格服务端schema', async () => {
    await reviewLiveDemand('d1', 3, 'return', '补材料', {
      requestId: 'r1',
      name: 'x',
      department: 'd',
      priority: 'P1',
      primaryOwnerId: '',
      collaboratorIds: [],
      expectedLaunchDate: '',
      expectedDeliveryDate: '',
      stageExpectedDate: ''
    })
    expect(api).toHaveBeenCalledWith('/demands/d1/review', {
      method: 'POST',
      body: { requestId: 'r1', version: 3, decision: 'return', reason: '补材料' }
    })
  })
  it('票据后上传File再confirm，PUT失败不确认', async () => {
    api.mockResolvedValueOnce({
      attachmentId: 'a',
      uploadUrl: 'https://storage/upload',
      headers: { 'Content-Type': 'application/pdf' }
    })
    const put = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', put)
    const file = new File(['pdf'], 'x.pdf', { type: 'application/pdf' })
    await expect(uploadLiveMaterial('d1', 'prd', file)).rejects.toThrow('上传失败')
    expect(put).toHaveBeenCalledWith('https://storage/upload', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
      signal: expect.any(AbortSignal)
    })
    expect(api).toHaveBeenCalledTimes(1)
  })
})
