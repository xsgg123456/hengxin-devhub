import { beforeEach, expect, it, vi } from 'vitest'
import { useMaterialQueue } from './use-material-queue'
import { uploadLiveMaterial } from '@/services/live-material-service'
import { apiRequest } from '@/services/api-client'
vi.mock('@/services/api-client', async (original) => ({
  ...(await original<typeof import('@/services/api-client')>()),
  apiRequest: vi.fn()
}))
vi.mock('@/services/live-material-service', async (original) => ({
  ...(await original<typeof import('@/services/live-material-service')>()),
  uploadLiveMaterial: vi.fn()
}))
const upload = vi.mocked(uploadLiveMaterial)
const api = vi.mocked(apiRequest)
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
function setup(prototype = false) {
  const change = vi.fn()
  const busy = vi.fn()
  const controller = useMaterialQueue({ prototype, change, busy, ensureDemand: async () => 'd1' })
  return { ...controller, change, busyEvents: busy }
}
beforeEach(() => vi.resetAllMocks())
it('批量逐个排队，一个失败保留其他文件并允许单独重试', async () => {
  const queue = setup()
  upload.mockImplementation(async (_id, kindOrFile, ticket) => {
    const file = kindOrFile as unknown as File
    ;(ticket as unknown as (id: string) => void)(file.name)
    if (file.name === 'bad.bin') throw new Error('网络断开')
    return { kind: 'file', name: file.name, attachmentId: file.name, status: 'ready' }
  })
  queue.select(new File(['1'], 'good.png'))
  queue.select(new File(['2'], 'bad.bin'))
  queue.select(new File(['3'], 'last.xlsx'))
  await settled()
  expect(queue.rows.value.map((row) => row.material.status)).toEqual(['ready', 'failed', 'ready'])
  expect(queue.busyEvents.mock.calls).toEqual([[true], [false]])
  upload.mockResolvedValueOnce({
    kind: 'file',
    name: 'bad.bin',
    attachmentId: 'retry',
    status: 'ready'
  })
  queue.retry(queue.rows.value[1].key)
  await settled()
  expect(api).toHaveBeenCalledWith('/attachments/bad.bin', { method: 'DELETE' })
  expect(queue.rows.value.map((row) => row.material.status)).toEqual(['ready', 'ready', 'ready'])
})
it('旧文件移除不请求DELETE，保存后卸载不清理新文件', async () => {
  const queue = setup()
  queue.sync([{ kind: 'file', name: 'old', attachmentId: 'old', status: 'ready' }])
  await queue.remove(queue.rows.value[0].key)
  expect(api).not.toHaveBeenCalled()
  upload.mockImplementation(async (_id, _file, ticket) => {
    ;(ticket as unknown as (id: string) => void)('new')
    return { kind: 'file', name: 'new', attachmentId: 'new', status: 'ready' }
  })
  queue.select(new File(['x'], 'new'))
  await settled()
  queue.releaseCleanup()
  queue.dispose()
  await settled()
  expect(api).not.toHaveBeenCalled()
})
it('上传期间卸载等待票据完成后清理，busy最后平衡', async () => {
  const queue = setup()
  let finish!: () => void
  upload.mockImplementation(async (_id, _file, ticket) => {
    ;(ticket as unknown as (id: string) => void)('pending')
    await new Promise<void>((resolve) => {
      finish = resolve
    })
    return { kind: 'file', name: 'x', attachmentId: 'pending', status: 'ready' }
  })
  queue.select(new File(['x'], 'x'))
  await settled()
  queue.dispose()
  finish()
  await settled()
  expect(api).toHaveBeenCalledWith('/attachments/pending', { method: 'DELETE' })
  expect(queue.busyEvents.mock.calls).toEqual([[true], [false]])
})
it('任意格式可选，100 MB及500 MB额度在批量选择时累计', () => {
  const queue = setup(true)
  const file = new File(['a'], 'unknown.custom')
  Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 })
  for (let i = 0; i < 6; i++) queue.select(file)
  expect(queue.rows.value).toHaveLength(5)
  expect(queue.error.value).toContain('500 MB')
  expect(upload).not.toHaveBeenCalled()
  const large = new File(['a'], 'huge')
  Object.defineProperty(large, 'size', { value: 100 * 1024 * 1024 + 1 })
  queue.select(large)
  expect(queue.error.value).toContain('100 MB')
})
it('逐文件移除只清理自己的票据，失败保留条目可再次移除', async () => {
  const queue = setup()
  upload.mockImplementation(async (_id, fileArg, ticket) => {
    const file = fileArg as unknown as File
    ;(ticket as unknown as (id: string) => void)(file.name)
    return { kind: 'file', name: file.name, attachmentId: file.name, status: 'ready' }
  })
  queue.select(new File(['a'], 'a'))
  queue.select(new File(['b'], 'b'))
  await settled()
  const firstKey = queue.rows.value[0].key
  api.mockRejectedValueOnce(new Error('offline'))
  await queue.remove(firstKey)
  expect(queue.rows.value).toHaveLength(2)
  expect(queue.rows.value[0].error).toContain('重试移除')
  await queue.remove(firstKey)
  expect(queue.rows.value.map((row) => row.material.name)).toEqual(['b'])
  expect(api.mock.calls.map((call) => call[0])).toEqual(['/attachments/a', '/attachments/a'])
  queue.dispose()
  await settled()
  expect(api).toHaveBeenLastCalledWith('/attachments/b', { method: 'DELETE' })
})
