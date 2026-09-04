import { describe, expect, it } from 'vitest'
import {
  PrototypeDataError,
  PrototypeRepository,
  PROTOTYPE_STORAGE_KEY
} from './prototype-repository'

class MemoryStorage {
  private readonly data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
}

describe('PrototypeRepository', () => {
  it('首次加载会生成固定种子并持久化', () => {
    const storage = new MemoryStorage()
    const snapshot = new PrototypeRepository(storage).load()

    expect(snapshot.activeUserId).toBe('user-manager-chen')
    expect(snapshot.database.users).toHaveLength(4)
    expect(snapshot.database.projects).toHaveLength(3)
    expect(storage.getItem(PROTOTYPE_STORAGE_KEY)).not.toBeNull()
  })

  it('身份变更在刷新式重新加载后仍然保留', () => {
    const storage = new MemoryStorage()
    const repository = new PrototypeRepository(storage)
    repository.load()
    repository.transact((draft) => {
      draft.activeUserId = 'user-engineer-wang'
    })

    expect(new PrototypeRepository(storage).load().activeUserId).toBe('user-engineer-wang')
  })

  it('加载旧快照时把工程师身份标签迁移为系统角色并保留项目关系', () => {
    const storage = new MemoryStorage()
    const repository = new PrototypeRepository(storage)
    const snapshot = repository.load()
    const legacySnapshot = structuredClone(snapshot) as unknown as {
      revision: number
      database: {
        users: Array<Record<string, unknown>>
        demands: Array<Record<string, unknown>>
      }
    }
    legacySnapshot.revision = 7
    legacySnapshot.database.demands[0].status = 'returned'
    legacySnapshot.database.users[2] = {
      id: 'user-engineer-wang',
      name: '王浩然',
      department: '信息技术部',
      role: 'engineer',
      persona: 'primary',
      title: '项目主负责人'
    }
    storage.setItem(PROTOTYPE_STORAGE_KEY, JSON.stringify(legacySnapshot))

    const migrated = repository.load()
    expect(migrated.database.users[2]).toEqual({
      id: 'user-engineer-wang',
      name: '王浩然',
      department: '信息技术部',
      role: 'engineer',
      roleLabel: 'IT工程师'
    })
    expect(migrated.database.users[3]).toEqual({
      id: 'user-engineer-zhao',
      name: '赵清越',
      department: '信息技术部',
      role: 'engineer',
      roleLabel: 'IT工程师'
    })
    expect(migrated.revision).toBe(7)
    expect(migrated.database.demands[0].status).toBe('returned')
  })

  it('重置会恢复确定性业务快照并保留当前身份', () => {
    const storage = new MemoryStorage()
    const repository = new PrototypeRepository(storage)
    repository.load()
    repository.transact((draft) => {
      draft.activeUserId = 'user-business-li'
    })

    const reset = repository.reset('user-business-li')
    expect(reset.revision).toBe(0)
    expect(reset.activeUserId).toBe('user-business-li')
    expect(reset.updatedAt).toBe('2026-09-04T09:00:00+08:00')
  })

  it('拒绝损坏或包含未知身份的持久化数据', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      PROTOTYPE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, activeUserId: 'unknown' })
    )

    expect(() => new PrototypeRepository(storage).load()).toThrow(PrototypeDataError)
  })
})
