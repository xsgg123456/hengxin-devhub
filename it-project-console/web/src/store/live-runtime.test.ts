import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePrototypeStore } from './modules/prototype'
import { apiRequest, ApiError } from '@/services/api-client'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
vi.mock('@/services/api-client', async (importOriginal) => {
  const module = await importOriginal<typeof import('@/services/api-client')>()
  return { ...module, apiRequest: vi.fn() }
})
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})
it('真实读取采用服务器身份，未安装原型驱动时禁止模拟写入', async () => {
  const snapshot = createInitialPrototypeSnapshot()
  vi.mocked(apiRequest).mockResolvedValue(snapshot)
  const store = usePrototypeStore()
  await store.refreshLive()
  expect(store.currentUser.id).toBe(snapshot.activeUserId)
  await expect(store.runCommand(() => {})).rejects.toThrow('尚未接入真实服务')
  expect(store.snapshot).toEqual(snapshot)
})
it('写入成功而刷新失败仍返回成功并保留刷新提示', async () => {
  const store = usePrototypeStore()
  vi.mocked(apiRequest).mockRejectedValue(new ApiError('离线', 0))
  await expect(store.runLiveCommand(async () => ({ id: 'saved' }))).resolves.toEqual({
    id: 'saved'
  })
  expect(store.loadError).toContain('操作已成功')
  expect(store.saving).toBe(false)
})
it('会话失效清空已加载数据并恢复登录边界', async () => {
  const store = usePrototypeStore()
  vi.mocked(apiRequest).mockResolvedValueOnce(createInitialPrototypeSnapshot())
  await store.refreshLive()
  vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError('请登录', 401))
  await expect(store.refreshLive()).rejects.toThrow('请登录')
  expect(store.snapshot).toBeNull()
  expect(store.authRequired).toBe(true)
  expect(store.ready).toBe(false)
})
it('多个上传的离开保护直到全部结束才释放', () => {
  const store = usePrototypeStore()
  store.setUploadBusy(true)
  store.setUploadBusy(true)
  store.setUploadBusy(false)
  expect(store.uploading).toBe(true)
  store.setUploadBusy(false)
  store.setUploadBusy(false)
  expect(store.pendingUploads).toBe(0)
})
