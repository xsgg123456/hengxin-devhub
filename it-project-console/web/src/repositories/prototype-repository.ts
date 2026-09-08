import type { PrototypeSnapshot } from '@/domain/prototype'
import { DEMO_USERS } from '@/mocks/auth-context'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { migratePrototypeSnapshot } from './prototype-migration'
import { isPrototypeSnapshot } from './prototype-validation'

export interface PrototypeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const PROTOTYPE_STORAGE_KEY = 'it-project-console.prototype.v1'

export class PrototypeDataError extends Error {
  constructor(message = '演示数据无法读取') {
    super(message)
    this.name = 'PrototypeDataError'
  }
}

export class PrototypeRepository {
  constructor(private readonly storage: PrototypeStorage) {}

  load(): PrototypeSnapshot {
    let rawSnapshot: string | null
    try {
      rawSnapshot = this.storage.getItem(PROTOTYPE_STORAGE_KEY)
    } catch {
      throw new PrototypeDataError('浏览器存储不可用，请恢复存储权限后重新读取')
    }
    try {
      if (!rawSnapshot) return this.reset()
      const parsed: unknown = JSON.parse(rawSnapshot)
      const normalized = migratePrototypeSnapshot(parsed)
      if (!isPrototypeSnapshot(normalized)) throw new PrototypeDataError()
      if (JSON.stringify(normalized) !== rawSnapshot) this.write(normalized)
      return normalized
    } catch (error) {
      if (error instanceof PrototypeDataError) throw error
      throw new PrototypeDataError()
    }
  }

  reset(activeUserId?: string): PrototypeSnapshot {
    const initialSnapshot = createInitialPrototypeSnapshot()
    if (activeUserId && DEMO_USERS.some((user) => user.id === activeUserId)) {
      initialSnapshot.activeUserId = activeUserId
    }
    this.write(initialSnapshot)
    return structuredClone(initialSnapshot)
  }

  transact(mutator: (draft: PrototypeSnapshot) => void): PrototypeSnapshot {
    const draft = this.load()
    mutator(draft)
    if (!isPrototypeSnapshot(draft)) throw new PrototypeDataError('演示数据变更不合法')
    draft.revision += 1
    draft.updatedAt = new Date().toISOString()
    this.write(draft)
    return structuredClone(draft)
  }

  private write(snapshot: PrototypeSnapshot): void {
    this.storage.setItem(PROTOTYPE_STORAGE_KEY, JSON.stringify(snapshot))
  }
}

export function createBrowserPrototypeRepository(): PrototypeRepository {
  try {
    return new PrototypeRepository(window.localStorage)
  } catch {
    throw new PrototypeDataError('浏览器存储不可用，请恢复存储权限后重新读取')
  }
}
