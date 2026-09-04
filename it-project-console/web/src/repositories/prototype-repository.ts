import type { PrototypeSnapshot } from '@/domain/prototype'
import { DEMO_USERS } from '@/mocks/auth-context'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'

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

function isPrototypeSnapshot(value: unknown): value is PrototypeSnapshot {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  const database = candidate.database

  const validScenarios = ['normal', 'empty', 'loading', 'save-error', 'forbidden']

  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.revision === 'number' &&
    Number.isInteger(candidate.revision) &&
    candidate.revision >= 0 &&
    typeof candidate.activeUserId === 'string' &&
    DEMO_USERS.some((user) => user.id === candidate.activeUserId) &&
    typeof candidate.scenario === 'string' &&
    validScenarios.includes(candidate.scenario) &&
    typeof candidate.updatedAt === 'string' &&
    typeof database === 'object' &&
    database !== null &&
    (database as Record<string, unknown>).schemaVersion === 1 &&
    Array.isArray((database as Record<string, unknown>).users) &&
    Array.isArray((database as Record<string, unknown>).demands) &&
    Array.isArray((database as Record<string, unknown>).projects) &&
    Array.isArray((database as Record<string, unknown>).progressUpdates)
  )
}

export class PrototypeRepository {
  constructor(private readonly storage: PrototypeStorage) {}

  load(): PrototypeSnapshot {
    const rawSnapshot = this.storage.getItem(PROTOTYPE_STORAGE_KEY)
    if (!rawSnapshot) return this.reset()

    try {
      const parsed: unknown = JSON.parse(rawSnapshot)
      if (!isPrototypeSnapshot(parsed)) throw new PrototypeDataError()
      const normalized = structuredClone(parsed)
      if (JSON.stringify(normalized.database.users) !== JSON.stringify(DEMO_USERS)) {
        normalized.database.users = structuredClone([...DEMO_USERS])
        this.write(normalized)
      }
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
  return new PrototypeRepository(window.localStorage)
}
