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
  let repository: PrototypeRepository | null = null

  const currentUser = computed(() => {
    const activeUser = snapshot.value ? getDemoUser(snapshot.value.activeUserId) : undefined
    return activeUser ?? DEMO_USERS[0]
  })

  const navigationItems = computed(() => getNavigation(currentUser.value.role))
  const database = computed(() => snapshot.value?.database ?? null)

  const visibleProjects = computed<DemoProject[]>(() => {
    const projects = database.value?.projects ?? []
    const user = currentUser.value
    if (user.role === 'manager') return projects
    if (user.role === 'business') {
      return projects.filter((project) => project.department === user.department)
    }
    return projects.filter(
      (project) => project.primaryOwnerId === user.id || project.collaboratorIds.includes(user.id)
    )
  })

  const visibleDemands = computed(() => {
    const demands = database.value?.demands ?? []
    const user = currentUser.value
    if (user.role === 'manager') return demands
    if (user.role === 'business') {
      return demands.filter((demand) => demand.department === user.department)
    }
    return []
  })

  const overviewStats = computed(() => {
    const projects = database.value?.projects ?? []
    return {
      active: projects.filter((project) => project.status === 'active' && !project.archived).length,
      delayed: projects.filter((project) => project.risks.some((risk) => risk.includes('晚')))
        .length,
      stale: projects.filter((project) => project.risks.some((risk) => risk.includes('未更新')))
        .length,
      blocked: projects.filter((project) => project.simpleStatus === 'blocked').length,
      pending: database.value?.demands.filter((demand) => demand.status === 'pending').length ?? 0
    }
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
    overviewStats,
    initialize,
    switchUser,
    reset
  }
})
