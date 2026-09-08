import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { queryString, useLiveQuery } from './use-live-query'
const mocks = vi.hoisted(() => ({ request: vi.fn(), prototype: false }))
const store = reactive({ ready: true, authRequired: false, snapshot: { revision: 1 } })
vi.mock('@/config/runtime', () => ({
  runtimeConfig: {
    get isPrototype() {
      return mocks.prototype
    }
  }
}))
vi.mock('@/services/api-client', () => ({ apiRequest: mocks.request }))
vi.mock('@/store/modules/prototype', () => ({ usePrototypeStore: () => store }))
describe('真实查询生命周期', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.request.mockReset()
    mocks.prototype = false
    store.ready = true
    store.snapshot.revision = 1
  })
  afterEach(() => vi.useRealTimers())
  it('编码合法参数并保留false与页码', () => {
    expect(
      queryString({ keyword: 'A&B', includeArchived: false, page: 2, from: undefined, person: '' })
    ).toBe('keyword=A%26B&includeArchived=false&page=2')
  })
  it('快速筛选取消旧请求，晚到响应不覆盖新结果', async () => {
    let finishOld: (value: string[]) => void = () => {}
    mocks.request
      .mockImplementationOnce(
        () =>
          new Promise<string[]>((resolve) => {
            finishOld = resolve
          })
      )
      .mockResolvedValueOnce(['新项目'])
    const scope = effectScope(),
      keyword = ref('旧')
    const query = scope.run(() =>
      useLiveQuery<string[]>('/dashboard', () => ({ keyword: keyword.value }))
    )!
    await vi.advanceTimersByTimeAsync(180)
    const oldSignal = mocks.request.mock.calls[0][1].signal as AbortSignal
    keyword.value = '新'
    await nextTick()
    expect(oldSignal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(180)
    expect(query.data.value).toEqual(['新项目'])
    finishOld(['旧项目'])
    await nextTick()
    expect(query.data.value).toEqual(['新项目'])
    scope.stop()
  })
  it('失败保留重试状态；写入刷新revision后重新读取', async () => {
    mocks.request
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValueOnce(['已恢复'])
      .mockResolvedValueOnce(['更新后'])
    const scope = effectScope()
    const query = scope.run(() => useLiveQuery<string[]>('/gantt', () => ({ month: '2026-09' })))!
    await vi.advanceTimersByTimeAsync(180)
    expect(query.error.value).toBe('网络中断')
    expect(query.data.value).toBeUndefined()
    query.retry()
    await nextTick()
    await vi.advanceTimersByTimeAsync(180)
    expect(query.data.value).toEqual(['已恢复'])
    store.snapshot.revision++
    await nextTick()
    await vi.advanceTimersByTimeAsync(180)
    expect(query.data.value).toEqual(['更新后'])
    scope.stop()
  })
  it('原型模式不访问API，退出页面取消尚未发出的请求', async () => {
    mocks.prototype = true
    const scope = effectScope()
    scope.run(() => useLiveQuery('/dashboard', () => ({})))
    await vi.advanceTimersByTimeAsync(200)
    expect(mocks.request).not.toHaveBeenCalled()
    scope.stop()
    mocks.prototype = false
    const live = effectScope()
    live.run(() => useLiveQuery('/dashboard', () => ({})))
    live.stop()
    await vi.advanceTimersByTimeAsync(200)
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
