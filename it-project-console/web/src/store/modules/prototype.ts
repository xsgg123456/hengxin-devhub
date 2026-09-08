import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { DemoProject, PrototypeScenario, PrototypeSnapshot } from '@/domain/prototype'
import { getPrototypeDriver } from '@/store/business-runtime'
import { assertWrite } from '@/services/workflow-validation'
import { apiRequest, ApiError } from '@/services/api-client'
import { getNavigation } from '@/router/access'

export const usePrototypeStore = defineStore('prototypeStore', () => {
  const snapshot = ref<PrototypeSnapshot | null>(null)
  const ready = ref(false)
  const corrupted = ref(false)
  const dirtyForms = ref<Record<string, boolean>>({})
  const hasUnsavedChanges = computed(() => Object.values(dirtyForms.value).some(Boolean))
  const saving = ref(false)
  const resetVersion = ref(0)
  const loadError = ref('')
  const authRequired = ref(false)
  const pendingUploads = ref(0)
  const uploading = computed(() => pendingUploads.value > 0)
  function setUploadBusy(busy: boolean) {
    pendingUploads.value = Math.max(0, pendingUploads.value + (busy ? 1 : -1))
  }

  const currentUser = computed(() => {
    const activeUser = snapshot.value?.database.users.find(
      (user) => user.id === snapshot.value?.activeUserId
    )
    return (
      activeUser ??
      getPrototypeDriver()?.defaultUser ?? {
        id: '',
        name: '',
        department: '',
        role: 'business' as const,
        roleLabel: '业务人员' as const
      }
    )
  })

  const navigationItems = computed(() => getNavigation(currentUser.value.role))
  const database = computed(() =>
    snapshot.value
      ? (getPrototypeDriver()?.database(snapshot.value) ?? snapshot.value.database)
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

  function getRepository() {
    const driver = getPrototypeDriver()
    if (!driver) throw new Error('该操作尚未接入真实服务')
    return driver
  }

  async function refreshLive(): Promise<void> {
    try {
      snapshot.value = await apiRequest<PrototypeSnapshot>('/workspace')
      loadError.value = ''
      authRequired.value = false
      ready.value = true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        snapshot.value = null
        authRequired.value = true
        ready.value = false
      }
      loadError.value = error instanceof Error ? error.message : '数据加载失败'
      throw error
    }
  }

  async function runLiveCommand<T>(command: () => Promise<T>): Promise<T> {
    if (saving.value) throw new Error('正在保存，请稍候')
    saving.value = true
    try {
      const result = await command()
      try {
        await refreshLive()
      } catch {
        if (!authRequired.value) loadError.value = '操作已成功，但数据刷新失败，请刷新后继续'
      }
      return result
    } finally {
      saving.value = false
    }
  }

  function initialize(): void {
    if (!getPrototypeDriver() || (ready.value && !corrupted.value)) return
    try {
      snapshot.value = getRepository().load()
      corrupted.value = false
    } catch (error) {
      if (!getPrototypeDriver()?.isDataError(error)) throw error
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
      if (getPrototypeDriver()?.isDataError(error)) corrupted.value = true
      throw error
    } finally {
      saving.value = false
    }
  }

  return {
    loadError,
    authRequired,
    refreshLive,
    runLiveCommand,
    pendingUploads,
    uploading,
    setUploadBusy,
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
