import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { DemoProject, PrototypeScenario, PrototypeSnapshot } from '@/domain/prototype'
import { DEMO_USERS } from '@/mocks/auth-context'
import { projectScenarioDatabase } from '@/mocks/scenarios'
import { assertWrite } from '@/services/workflow-validation'
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
  const resetVersion = ref(0)
  let repository: PrototypeRepository | null = null

  const currentUser = computed(() => {
    const activeUser = snapshot.value?.database.users.find(
      (user) => user.id === snapshot.value?.activeUserId
    )
    return activeUser ?? DEMO_USERS[0]
  })

  const navigationItems = computed(() => getNavigation(currentUser.value.role))
  const database = computed(() =>
    snapshot.value
      ? projectScenarioDatabase(snapshot.value.database, snapshot.value.scenario)
      : null
  )

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
    if (saving.value) throw new Error('正在保存，请稍候')
    if (!snapshot.value?.database.users.some((user) => user.id === userId)) return
    snapshot.value = getRepository().transact((draft) => {
      draft.activeUserId = userId
    })
  }

  function reset(): void {
    if (saving.value) throw new Error('正在保存，请稍候')
    snapshot.value = getRepository().reset(currentUser.value.id)
    try {
      const filters = window.sessionStorage
      if (filters) {
        for (let index = filters.length - 1; index >= 0; index--) {
          const key = filters.key(index)
          if (key?.startsWith('it-project-console.filters.')) filters.removeItem(key)
        }
      }
    } catch {
      // 浏览器禁用会话缓存时，业务重置仍已成功；页面重建恢复默认筛选。
    }
    corrupted.value = false
    ready.value = true
    clearDirty()
    resetVersion.value++
  }

  function setScenario(scenario: PrototypeScenario): void {
    if (saving.value) throw new Error('正在保存，请稍候')
    snapshot.value = getRepository().transact((draft) => {
      draft.scenario = scenario
    })
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
      await new Promise<void>((resolve) => setTimeout(resolve, 600))
      snapshot.value = getRepository().transact((draft) => {
        assertWrite(draft)
        mutator(draft)
      })
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
    resetVersion,
    setScenario,
    runCommand,
    saving,
    setDirty,
    clearDirty,
    hasUnsavedChanges
  }
})
