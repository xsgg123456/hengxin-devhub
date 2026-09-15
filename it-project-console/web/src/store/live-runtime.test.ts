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
it('晚到工作区响应不覆盖后发刷新，后台读取不改未保存状态', async () => {
  const store = usePrototypeStore()
  let finish!: (value: ReturnType<typeof createInitialPrototypeSnapshot>) => void
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const old = store.refreshLive()
  const fresh = createInitialPrototypeSnapshot(); fresh.revision = 999
  vi.mocked(apiRequest).mockResolvedValueOnce(fresh)
  store.setDirty('editor', true); store.setUploadBusy(true)
  await store.refreshLive({ background: true })
  finish(createInitialPrototypeSnapshot()); await old
  expect(store.snapshot?.revision).toBe(999)
  expect(store.hasUnsavedChanges).toBe(true); expect(store.uploading).toBe(true)
})
it('退出后晚到成功响应不能恢复旧账号', async () => {
  const store = usePrototypeStore()
  let finish!: (value: ReturnType<typeof createInitialPrototypeSnapshot>) => void
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const request = store.refreshLive()
  store.authRequired = true; store.ready = false; store.snapshot = null
  finish(createInitialPrototypeSnapshot()); await request
  expect(store.snapshot).toBeNull(); expect(store.authRequired).toBe(true)
})
