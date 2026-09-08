import { installPrototypeDriver } from '@/mocks/store-adapter'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePrototypeStore } from '@/store/modules/prototype'
import { createInitialPrototypeSnapshot } from './seed'
import { projectScenarioDatabase, PROTOTYPE_SCENARIOS } from './scenarios'
import { assertWrite } from '@/services/workflow-validation'

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      }
    }
  })
  setActivePinia(createPinia())
    installPrototypeDriver()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('受控演示场景', () => {
  it.each(['access', 'remove'])('会话缓存拒绝%s时仍完成业务重置与页面恢复', (failure) => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        if (failure === 'access') throw new DOMException('禁止访问', 'SecurityError')
        return {
          length: 1,
          key: () => 'it-project-console.filters.user-a.overview',
          removeItem: () => {
            throw new DOMException('禁止删除', 'SecurityError')
          }
        }
      }
    })
    const store = usePrototypeStore()
    store.initialize()
    store.setScenario('empty')
    store.setDirty('form', true)
    expect(() => store.reset()).not.toThrow()
    expect(store.snapshot?.scenario).toBe('normal')
    expect(store.database?.projects.length).toBeGreaterThan(0)
    expect(store.hasUnsavedChanges).toBe(false)
    expect(store.resetVersion).toBe(1)
    expect(store.corrupted).toBe(false)
    expect(store.ready).toBe(true)
  })
  it('重置成功才清除全部角色筛选，不清除其他会话数据', () => {
    const filters = new Map([
      ['it-project-console.filters.user-a.overview', 'a'],
      ['it-project-console.filters.user-b.personal', 'b'],
      ['unrelated', 'keep']
    ])
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        get length() {
          return filters.size
        },
        key: (index: number) => [...filters.keys()][index] ?? null,
        removeItem: (key: string) => filters.delete(key)
      }
    })
    const store = usePrototypeStore()
    store.initialize()
    const write = vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('写入失败')
    })
    expect(() => store.reset()).toThrow()
    expect(filters.size).toBe(3)
    expect(store.resetVersion).toBe(0)
    write.mockRestore()
    store.reset()
    expect([...filters.entries()]).toEqual([['unrelated', 'keep']])
    expect(store.resetVersion).toBe(1)
  })
  it('空数据只投影视图并保留身份和原业务记录', () => {
    const initial = createInitialPrototypeSnapshot()
    const before = structuredClone(initial.database)
    const projected = projectScenarioDatabase(initial.database, 'empty')
    expect(projected.projects).toEqual([])
    expect(projected.demands).toEqual([])
    expect(projected.users).toEqual(before.users)
    expect(initial.database).toEqual(before)
    expect(projectScenarioDatabase(initial.database, 'normal')).toEqual(before)
  })

  it.each(PROTOTYPE_SCENARIOS)('$label场景持久化，恢复正常不覆盖业务数据', ({ value }) => {
    const store = usePrototypeStore()
    store.initialize()
    const before = JSON.stringify(store.snapshot?.database)
    store.setScenario(value)
    setActivePinia(createPinia())
    installPrototypeDriver()
    const reloaded = usePrototypeStore()
    reloaded.initialize()
    expect(reloaded.snapshot?.scenario).toBe(value)
    expect(JSON.stringify(reloaded.snapshot?.database)).toBe(before)
    reloaded.setScenario('normal')
    expect(JSON.stringify(reloaded.database)).toBe(before)
  })

  it.each(['empty', 'loading', 'network-error', 'save-error', 'forbidden'] as const)(
    '%s禁止写入且不破坏数据',
    async (scenario) => {
      const store = usePrototypeStore()
      store.initialize()
      store.setScenario(scenario)
      const before = JSON.stringify(store.snapshot)
      expect(() => assertWrite(store.snapshot!)).toThrow()
      vi.useFakeTimers()
      const mutation = vi.fn()
      const rejected = expect(store.runCommand(mutation)).rejects.toThrow()
      await vi.advanceTimersByTimeAsync(600)
      await rejected
      expect(mutation).not.toHaveBeenCalled()
      expect(JSON.stringify(store.snapshot)).toBe(before)
      expect(store.saving).toBe(false)
    }
  )

  it('提交期间可观察忙碌状态并阻止重复提交、身份切换、重置和场景切换', async () => {
    const store = usePrototypeStore()
    store.initialize()
    vi.useFakeTimers()
    const mutation = vi.fn()
    const command = store.runCommand(mutation)
    expect(store.saving).toBe(true)
    expect(() => store.setScenario('loading')).toThrow('正在保存')
    expect(() => store.reset()).toThrow('正在保存')
    expect(() => store.switchUser('user-engineer-wang')).toThrow('正在保存')
    await expect(store.runCommand(mutation)).rejects.toThrow('正在保存')
    await vi.advanceTimersByTimeAsync(599)
    expect(mutation).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await command
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(store.saving).toBe(false)
  })

  it('重置清除场景和未保存标识并通知页面重建', () => {
    const store = usePrototypeStore()
    store.initialize()
    store.setScenario('empty')
    store.setDirty('form', true)
    store.reset()
    expect(store.snapshot?.scenario).toBe('normal')
    expect(store.hasUnsavedChanges).toBe(false)
    expect(store.resetVersion).toBe(1)
    expect(store.database?.projects.length).toBeGreaterThan(0)
  })
})
