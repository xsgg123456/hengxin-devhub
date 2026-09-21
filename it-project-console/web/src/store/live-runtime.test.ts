import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { usePrototypeStore } from './modules/prototype'
import { useWorkspaceSync } from '@/hooks/business/use-workspace-sync'
import { apiRequest, ApiError } from '@/services/api-client'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
vi.mock('@/services/api-client', async (importOriginal) => {
  const module = await importOriginal<typeof import('@/services/api-client')>()
  return { ...module, apiRequest: vi.fn() }
})
class RuntimeStream extends EventTarget {
  static instances: RuntimeStream[] = []
  close = vi.fn()
  constructor() {
    super()
    RuntimeStream.instances.push(this)
  }
}
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})
it('真实读取采用服务器身份，未安装原型驱动时禁止模拟写入', async () => {
  const snapshot = createInitialPrototypeSnapshot()
  vi.mocked(apiRequest).mockResolvedValue(snapshot)
  const store = usePrototypeStore()
  await expect(store.refreshLive()).resolves.toEqual({
    status: 'applied',
    revision: String(snapshot.revision)
  })
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
  await expect(store.refreshLive()).resolves.toEqual({ status: 'failed', error: '请登录' })
  expect(store.snapshot).toBeNull()
  expect(store.authRequired).toBe(true)
  expect(store.ready).toBe(false)
})

it('刷新失败返回中文失败状态，调用方可在不抛异常的情况下显示重试入口', async () => {
  const store = usePrototypeStore()
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error('network down'))
  await expect(store.refreshLive()).resolves.toEqual({
    status: 'failed',
    error: '数据加载失败，请重试'
  })
  expect(store.loadError).toBe('数据加载失败，请重试')
})
it('后台同步失败保留当前数据并暴露中文重试状态', async () => {
  const store = usePrototypeStore()
  vi.mocked(apiRequest).mockResolvedValueOnce(createInitialPrototypeSnapshot())
  await store.refreshLive()
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error('network down'))
  await expect(store.refreshLive({ background: true })).resolves.toEqual({
    status: 'failed',
    error: '数据加载失败，请重试'
  })
  expect(store.snapshot).not.toBeNull()
  expect(store.syncError).toBe('数据加载失败，请重试')
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
  finish(createInitialPrototypeSnapshot());
  await expect(old).resolves.toEqual({ status: 'superseded' })
  expect(store.snapshot?.revision).toBe(999)
  expect(store.hasUnsavedChanges).toBe(true); expect(store.uploading).toBe(true)
})
it('退出后晚到成功响应不能恢复旧账号', async () => {
  const store = usePrototypeStore()
  let finish!: (value: ReturnType<typeof createInitialPrototypeSnapshot>) => void
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const request = store.refreshLive()
  store.authRequired = true; store.ready = false; store.snapshot = null
  finish(createInitialPrototypeSnapshot());
  await expect(request).resolves.toEqual({ status: 'superseded' })
  expect(store.snapshot).toBeNull(); expect(store.authRequired).toBe(true)
})

it('真实 store 与 workspace sync 并发时，抢占响应不会推进水位且会重试', async () => {
  vi.useFakeTimers()
  const initial = createInitialPrototypeSnapshot()
  initial.revision = 1
  const eventSnapshot = structuredClone(initial)
  eventSnapshot.revision = 2
  const externalSnapshot = structuredClone(initial)
  externalSnapshot.revision = 3
  const recoverySnapshot = structuredClone(initial)
  recoverySnapshot.revision = 4
  let resolveEvent!: (value: typeof eventSnapshot) => void
  let eventStarted!: () => void
  const eventStartedPromise = new Promise<void>(resolve => { eventStarted = resolve })
  vi.mocked(apiRequest)
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(initial)
    .mockImplementationOnce(() => {
      eventStarted()
      return new Promise(resolve => { resolveEvent = resolve })
    })
    .mockResolvedValueOnce(externalSnapshot)
    .mockResolvedValueOnce(recoverySnapshot)
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const win = new EventTarget()
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', win)
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('EventSource', RuntimeStream)
  RuntimeStream.instances = []
  const store = usePrototypeStore()
  await store.refreshLive()
  const scope = effectScope()
  scope.run(useWorkspaceSync)
  await nextTick()
  await Promise.resolve()
  const stream = RuntimeStream.instances[0]
  stream.dispatchEvent(new MessageEvent('change', { data: JSON.stringify({ revision: '2' }) }))
  await eventStartedPromise
  await store.refreshLive()
  resolveEvent(eventSnapshot)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(1000)
  expect(store.snapshot?.revision).toBe(4)
  scope.stop()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('后发刷新失败时，前发响应仍被标记为抢占并由同步器补拉，不会丢版本', async () => {
  vi.useFakeTimers()
  const initial = createInitialPrototypeSnapshot()
  initial.revision = 1
  const eventSnapshot = structuredClone(initial)
  eventSnapshot.revision = 2
  const recoverySnapshot = structuredClone(eventSnapshot)
  let resolveEvent!: (value: typeof eventSnapshot) => void
  let eventStarted!: () => void
  const eventStartedPromise = new Promise<void>(resolve => { eventStarted = resolve })
  vi.mocked(apiRequest)
    .mockResolvedValueOnce(initial)
    .mockResolvedValueOnce(initial)
    .mockImplementationOnce(() => {
      eventStarted()
      return new Promise(resolve => { resolveEvent = resolve })
    })
    .mockRejectedValueOnce(new ApiError('网络暂时不可用', 0))
    .mockResolvedValueOnce(recoverySnapshot)
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const win = new EventTarget()
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', win)
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('EventSource', RuntimeStream)
  RuntimeStream.instances = []
  const store = usePrototypeStore()
  await store.refreshLive()
  const scope = effectScope()
  scope.run(useWorkspaceSync)
  await nextTick()
  await Promise.resolve()
  const stream = RuntimeStream.instances[0]
  stream.dispatchEvent(new MessageEvent('change', { data: JSON.stringify({ revision: '2' }) }))
  await eventStartedPromise
  const failed = await store.refreshLive()
  expect(failed).toMatchObject({ status: 'failed' })
  resolveEvent(eventSnapshot)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(1000)
  expect(store.snapshot?.revision).toBe(2)
  scope.stop()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
