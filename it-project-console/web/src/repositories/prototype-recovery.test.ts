import { describe, expect, it, vi } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import {
  createBrowserPrototypeRepository,
  PrototypeDataError,
  PrototypeRepository,
  PROTOTYPE_STORAGE_KEY
} from './prototype-repository'

describe('损坏数据与存储故障恢复', () => {
  it('浏览器拒绝访问localStorage属性时仍转为可恢复错误', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('Access denied')
      }
    })
    try {
      expect(createBrowserPrototypeRepository).toThrow(PrototypeDataError)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it.each([
    ['projects', [null]],
    ['stageHistories', [null]],
    ['scheduleChanges', [{ id: 'broken' }]],
    ['progressUpdates', [{ id: 'broken', createdAt: null }]],
    ['lifecycleEvents', [{ id: 'broken', before: null }]],
    ['users', []]
  ])('拒绝损坏的%s且不覆盖原始数据', (field, invalid) => {
    const raw = createInitialPrototypeSnapshot() as unknown as { database: Record<string, unknown> }
    raw.database[field as string] = invalid
    let saved = JSON.stringify(raw)
    const original = saved
    const repository = new PrototypeRepository({
      getItem: () => saved,
      setItem: (_key, value) => {
        saved = value
      }
    })
    expect(() => repository.load()).toThrow(PrototypeDataError)
    expect(saved).toBe(original)
  })
  it('完整JSON中非法日期和百分比也显示恢复边界，不让页面抛异常', () => {
    const raw = createInitialPrototypeSnapshot()
    raw.database.projects[0].expectedDeliveryDate = '2026-02-31'
    const storage = {
      getItem: () => JSON.stringify(raw),
      setItem: () => {
        throw new Error('不应写入')
      }
    }
    expect(() => new PrototypeRepository(storage).load()).toThrow(PrototypeDataError)
    raw.database.projects[0].expectedDeliveryDate = '2026-10-30'
    raw.database.projects[0].overallProgress = 101
    expect(() => new PrototypeRepository(storage).load()).toThrow(PrototypeDataError)
  })
  it('存储读取和首次初始化写入失败都转为可恢复错误', () => {
    expect(() =>
      new PrototypeRepository({
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {}
      }).load()
    ).toThrow(PrototypeDataError)
    expect(() =>
      new PrototypeRepository({
        getItem: () => null,
        setItem: () => {
          throw new Error('quota')
        }
      }).load()
    ).toThrow(PrototypeDataError)
  })
  it('恢复后重新读取保留成功数据，重置失败保留原内容，成功重置恢复固定种子', () => {
    let saved = JSON.stringify(createInitialPrototypeSnapshot()),
      fail = false
    const repository = new PrototypeRepository({
      getItem: () => {
        if (fail) throw new Error('blocked')
        return saved
      },
      setItem: (key, value) => {
        expect(key).toBe(PROTOTYPE_STORAGE_KEY)
        if (fail) throw new Error('blocked')
        saved = value
      }
    })
    repository.transact((draft) => {
      draft.database.projects[0].overallProgress = 71
    })
    const success = saved
    fail = true
    expect(() => repository.load()).toThrow(PrototypeDataError)
    expect(() => repository.reset()).toThrow()
    expect(saved).toBe(success)
    fail = false
    expect(repository.load().database.projects[0].overallProgress).toBe(71)
    expect(repository.reset().database.projects[0].overallProgress).toBe(65)
  })
})
