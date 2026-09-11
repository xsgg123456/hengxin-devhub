import { projectCode } from '@/utils/project-code'
import { computed, ref, watch } from 'vue'
import { runtimeConfig } from '@/config/runtime'
import { useLiveQuery } from './use-live-query'
import type { DashboardResult } from '@/services/live-dashboard-types'
import { useRouter } from 'vue-router'
import { usePrototypeStore } from '@/store/modules/prototype'
import { computeProjectRisks } from '@/services/risk-service'
import { isEngineerEligible } from '@/utils/engineer-eligibility'

export function useProjectOverviewFilters(personal = false) {
  const store = usePrototypeStore(),
    router = useRouter()
  const scope = ref(personal && store.currentUser.role === 'engineer' ? 'mine' : 'all')
  const status = ref('all'),
    person = ref(''),
    riskFilter = ref('all')
  const keyword = ref(''),
    department = ref(''),
    stage = ref('')
  const dates = ref<[string, string] | null>(null),
    includeArchived = ref(false)
  const engineers = computed(() => store.database?.users.filter((u) => isEngineerEligible(u)) ?? [])
  const departments = computed(() => [...new Set(store.visibleProjects.map((p) => p.department))])
  const prototypeProjects = computed(() =>
    store.visibleProjects
      .map((p) => ({
        ...p,
        risks:
          p.riskVersion !== undefined
            ? p.risks
            : computeProjectRisks(p, store.database?.scheduleChanges ?? [])
      }))
      .filter((p) => {
        if (!includeArchived.value && p.archived) return false
        if (
          scope.value === 'mine' &&
          p.primaryOwnerId !== store.currentUser.id &&
          !p.collaboratorIds.includes(store.currentUser.id)
        )
          return false
        if (status.value !== 'all' && p.status !== status.value) return false
        if (
          person.value &&
          p.primaryOwnerId !== person.value &&
          !p.collaboratorIds.includes(person.value)
        )
          return false
        if (department.value && p.department !== department.value) return false
        if (stage.value && p.stage !== stage.value) return false
        const owner = store.database?.users.find((u) => u.id === p.primaryOwnerId)?.name ?? ''
        if (
          keyword.value.trim() &&
          !`${p.name} ${projectCode(p)} ${owner} ${p.department}`
            .toLowerCase()
            .includes(keyword.value.trim().toLowerCase())
        )
          return false
        if (
          dates.value &&
          (p.expectedDeliveryDate < dates.value[0] || p.expectedDeliveryDate > dates.value[1])
        )
          return false
        if (riskFilter.value === 'any') return p.risks.length > 0
        if (riskFilter.value === 'delayed') return p.risks.some((r) => r.includes('延期'))
        if (riskFilter.value === 'stale') return p.risks.some((r) => r.includes('未更新'))
        if (riskFilter.value === 'blocked')
          return p.status === 'active' && !p.archived && p.simpleStatus === 'blocked'
        return true
      })
      .sort(
        (a, b) =>
          Number(b.risks.some((r) => r.includes('延期'))) -
            Number(a.risks.some((r) => r.includes('延期'))) ||
          b.risks.length - a.risks.length ||
          b.updatedAt.localeCompare(a.updatedAt)
      )
  )
  const prototypeMetrics = computed(() => [
    {
      label: '在手项目',
      key: 'active',
      value: projects.value.filter((p) => p.status === 'active' && !p.archived).length
    },
    {
      label: '已延期',
      key: 'delayed',
      value: projects.value.filter((p) => p.risks.some((r) => r.includes('延期'))).length
    },
    {
      label: '超期未更新',
      key: 'stale',
      value: projects.value.filter((p) => p.risks.some((r) => r.includes('未更新'))).length
    },
    {
      label: '已阻塞',
      key: 'blocked',
      value: projects.value.filter(
        (p) => p.status === 'active' && !p.archived && p.simpleStatus === 'blocked'
      ).length
    },
    {
      label: '待立项',
      key: 'pending',
      value: store.visibleDemands.filter(
        (d) =>
          d.status === 'pending' &&
          (!department.value || d.department === department.value) &&
          (scope.value !== 'mine' || d.submitterId === store.currentUser.id)
      ).length
    }
  ])
  const page = ref(1)
  const pageSize = 20
  const query = computed(() => ({
    scope: scope.value,
    status: status.value,
    person: person.value,
    risk: riskFilter.value,
    keyword: keyword.value,
    department: department.value,
    stage: stage.value,
    includeArchived: includeArchived.value,
    from: dates.value?.[0],
    to: dates.value?.[1]
  }))
  watch(query, () => {
    page.value = 1
  })
  const { data, loading, error, retry } = useLiveQuery<DashboardResult>('/dashboard', () => ({
    ...query.value,
    page: page.value,
    pageSize
  }))
  const projects = computed(() =>
    runtimeConfig.isPrototype ? prototypeProjects.value : (data.value?.projects ?? [])
  )
  const items = computed(() =>
    runtimeConfig.isPrototype
      ? projects.value.slice((page.value - 1) * pageSize, page.value * pageSize)
      : (data.value?.items ?? [])
  )
  const total = computed(() =>
    runtimeConfig.isPrototype ? projects.value.length : (data.value?.total ?? 0)
  )
  const metrics = computed(() =>
    runtimeConfig.isPrototype ? prototypeMetrics.value : (data.value?.metrics ?? [])
  )
  watch(total, (value) => {
    if (page.value > Math.max(1, Math.ceil(value / pageSize)) && !loading.value)
      page.value = Math.max(1, Math.ceil(value / pageSize))
  })
  function clearFilters() {
    status.value = 'all'
    person.value = ''
    dates.value = null
    riskFilter.value = 'all'
    includeArchived.value = false
    keyword.value = ''
    department.value = ''
    stage.value = ''
  }
  function applyMetric(key: string) {
    if (key === 'pending') {
      void router.push({
        path: '/my-demands',
        query: { status: 'pending', scope: scope.value, department: department.value }
      })
      return
    }
    status.value = key === 'active' ? key : 'all'
    riskFilter.value = key === 'active' ? 'all' : key
  }
  // UI preferences are separate from the shared business database and scoped by account/page.
  const storageKey = () =>
    `it-project-console.filters.${store.currentUser.id}.${personal ? 'personal' : 'overview'}`
  function restore() {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey()) ?? 'null')
      if (!saved || typeof saved !== 'object') return
      const f = saved as Record<string, unknown>
      for (const [key, target] of Object.entries({
        scope,
        status,
        person,
        riskFilter,
        keyword,
        department,
        stage
      }))
        if (typeof f[key] === 'string') target.value = f[key]
      includeArchived.value = f.includeArchived === true
      dates.value =
        Array.isArray(f.dates) &&
        f.dates.length === 2 &&
        f.dates.every((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
          ? (f.dates as [string, string])
          : null
    } catch {
      /* Ignore unavailable or malformed UI preferences. */
    }
  }
  restore()
  watch(
    [scope, status, person, dates, riskFilter, includeArchived, keyword, department, stage],
    () => {
      try {
        sessionStorage.setItem(
          storageKey(),
          JSON.stringify({
            scope: scope.value,
            status: status.value,
            person: person.value,
            dates: dates.value,
            riskFilter: riskFilter.value,
            includeArchived: includeArchived.value,
            keyword: keyword.value,
            department: department.value,
            stage: stage.value
          })
        )
      } catch {
        /* Preferences are optional. */
      }
    }
  )
  return {
    distribution: computed(() => data.value?.distribution),
    query,
    page,
    pageSize,
    items,
    total,
    loading,
    error,
    retry,
    scope,
    status,
    person,
    dates,
    riskFilter,
    includeArchived,
    keyword,
    department,
    stage,
    projects,
    metrics,
    engineers,
    departments,
    clearFilters,
    applyMetric
  }
}
