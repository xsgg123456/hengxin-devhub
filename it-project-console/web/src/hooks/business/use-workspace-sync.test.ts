import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { useWorkspaceSync } from './use-workspace-sync'
const mocks = vi.hoisted(() => ({ request: vi.fn(), refresh: vi.fn(), prototype: false }))
const state = reactive({ ready: true, authRequired: false, currentUser: { id: 'one' }, refreshLive: mocks.refresh })
vi.mock('@/store/modules/prototype', () => ({ usePrototypeStore: () => state }))
vi.mock('@/services/api-client', () => ({ apiRequest: mocks.request }))
vi.mock('@/config/runtime', () => ({ runtimeConfig: { apiBaseUrl: '/api', get isPrototype() { return mocks.prototype } } }))
class Stream extends EventTarget {
  static instances: Stream[] = []
  close = vi.fn()
  constructor() { super(); Stream.instances.push(this) }
  change(revision: string) { this.dispatchEvent(new MessageEvent('change', { data: JSON.stringify({ revision }) })) }
}
let doc: EventTarget & { visibilityState: string }
let win: EventTarget
let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  vi.useFakeTimers(); mocks.request.mockReset(); mocks.refresh.mockReset().mockResolvedValue(undefined)
  mocks.prototype = false; state.ready = true; state.authRequired = false
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }); win = new EventTarget()
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('EventSource', Stream); Stream.instances = []; scope = effectScope()
})
afterEach(() => { scope.stop(); vi.unstubAllGlobals(); vi.useRealTimers() })
it('变更信号去重，并在连接恢复时补拉', async () => {
  scope.run(useWorkspaceSync); await nextTick()
  const stream = Stream.instances[0]
  stream.change('v1'); await nextTick()
  const calls = mocks.refresh.mock.calls.length
  stream.change('v1'); await nextTick()
  expect(mocks.refresh).toHaveBeenCalledTimes(calls)
  stream.dispatchEvent(new Event('open')); await nextTick()
  expect(mocks.refresh).toHaveBeenCalledTimes(calls + 1)
  state.currentUser = { id: 'one' }; await nextTick()
  expect(Stream.instances).toHaveLength(1)
})
it('刷新期间收到新版本合并排队，不漏最后一次修改', async () => {
  let finish!: () => void
  mocks.refresh.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  scope.run(useWorkspaceSync)
  const stream = Stream.instances[0]
  stream.change('v2'); stream.change('v3')
  expect(mocks.refresh).toHaveBeenCalledTimes(1)
  finish(); await nextTick(); await nextTick()
  expect(mocks.refresh).toHaveBeenCalledTimes(2)
  stream.change('v3'); await nextTick()
  expect(mocks.refresh).toHaveBeenCalledTimes(2)
})
it('SSE不可用时30秒版本兜底，失败不会标记已同步', async () => {
  scope.run(useWorkspaceSync); await nextTick()
  mocks.refresh.mockRejectedValueOnce(new Error('断网'))
  mocks.request.mockResolvedValue({ revision: 'fallback' })
  await vi.advanceTimersByTimeAsync(30000)
  const calls = mocks.refresh.mock.calls.length
  await vi.advanceTimersByTimeAsync(30000)
  expect(mocks.refresh).toHaveBeenCalledTimes(calls + 1)
  await vi.advanceTimersByTimeAsync(30000)
  expect(mocks.refresh).toHaveBeenCalledTimes(calls + 1)
})
it('隐藏、退出和卸载清理连接及计时，回前台重建', async () => {
  scope.run(useWorkspaceSync); await nextTick()
  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
  expect(Stream.instances[0].close).toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(30000); expect(mocks.request).not.toHaveBeenCalled()
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'))
  expect(Stream.instances).toHaveLength(2)
  state.authRequired = true; await nextTick()
  expect(Stream.instances[1].close).toHaveBeenCalled()
  scope.stop(); win.dispatchEvent(new Event('focus'))
  expect(Stream.instances).toHaveLength(2)
})
it('原型模式不连接；会话失效转交统一登录处理', async () => {
  mocks.prototype = true; scope.run(useWorkspaceSync)
  expect(Stream.instances).toHaveLength(0); scope.stop()
  mocks.prototype = false; scope = effectScope(); scope.run(useWorkspaceSync)
  const expired = vi.fn(); win.addEventListener('itpc-session-expired', expired)
  Stream.instances[0].dispatchEvent(new Event('session-expired'))
  expect(expired).toHaveBeenCalledTimes(1)
  expect(Stream.instances[0].close).toHaveBeenCalled()
})
