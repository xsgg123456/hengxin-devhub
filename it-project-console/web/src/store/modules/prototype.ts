import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { DemoProject, PrototypeSnapshot } from '@/domain/prototype'
import { DEMO_USERS, getDemoUser } from '@/mocks/auth-context'
import {
  createBrowserPrototypeRepository,
  PrototypeDataError,
  type PrototypeRepository
} from '@/repositories/prototype-repository'
import { getNavigation } from '@/router/access'

export const usePrototypeStore = defineStore('prototypeStore', () => {
  const snapshot = ref<PrototypeSnapshot | null>(null)
  const ready = ref(false)
  const corrupted = ref(false)
  const dirtyForms = ref<Record<string, boolean>>({})
  const hasUnsavedChanges = computed(() => Object.values(dirtyForms.value).some(Boolean))
  const saving = ref(false)
  let repository: PrototypeRepository | null = null

  const currentUser = computed(() => {
    const activeUser = snapshot.value ? getDemoUser(snapshot.value.activeUserId) : undefined
    return activeUser ?? DEMO_USERS[0]
  })

  const navigationItems = computed(() => getNavigation(currentUser.value.role))
  const database = computed(() => snapshot.value?.database ?? null)

  const visibleProjects = computed<DemoProject[]>(() => {
    const projects = database.value?.projects ?? []
    return projects
  })

  const visibleDemands = computed(() => {
    const demands = database.value?.demands ?? []
    return demands
  })

  function getRepository(): PrototypeRepository {
    repository ??= createBrowserPrototypeRepository()
    return repository
  }

  function initialize(): void {
    if (ready.value && !corrupted.value) return
    try {
      snapshot.value = getRepository().load()
      corrupted.value = false
    } catch (error) {
      if (!(error instanceof PrototypeDataError)) throw error
      corrupted.value = true
    } finally {
      ready.value = true
    }
  }

  function switchUser(userId: string): void {
    if (!getDemoUser(userId)) return
    snapshot.value = getRepository().transact((draft) => {
      draft.activeUserId = userId
    })
  }

  function reset(): void {
    snapshot.value = getRepository().reset(currentUser.value.id)
    corrupted.value = false
    ready.value = true
    clearDirty()
  }

  function setDirty(key: string, dirty: boolean): void {
    dirtyForms.value[key] = dirty
  }

  function clearDirty(): void {
    dirtyForms.value = {}
  }

  async function runCommand(mutator: (draft: PrototypeSnapshot) => void): Promise<void> {
    if (saving.value) throw new Error('正在保存，请稍候')
    saving.value = true
    try {
      // Yield one frame so the disabled/loading controls are painted before persistence.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      snapshot.value = getRepository().transact(mutator)
    } catch (error) {
      if (error instanceof PrototypeDataError) corrupted.value = true
      throw error
    } finally {
      saving.value = false
    }
  }

  return {
    snapshot,
    ready,
    corrupted,
    currentUser,
    navigationItems,
    database,
    visibleProjects,
    visibleDemands,
    initialize,
    switchUser,
    reset,
    runCommand,
    saving,
    setDirty,
    clearDirty,
    hasUnsavedChanges
  }
})
