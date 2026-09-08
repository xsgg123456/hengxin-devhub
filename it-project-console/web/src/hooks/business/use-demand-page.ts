import { runtimeConfig } from '@/config/runtime'
import { useLiveQuery } from './use-live-query'
import type { DemandStatistics } from '@/services/live-dashboard-types'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { displayTime } from '@/utils/project-display'
import type { DemoDemand, DemandStatus } from '@/domain/prototype'
import { usePrototypeStore } from '@/store/modules/prototype'

export function useDemandPage() {
  const prototypeStore = usePrototypeStore()
  const router = useRouter()
  const route = useRoute()
  const scope = ref(prototypeStore.currentUser.role === 'business' ? 'mine' : 'all')
  const keyword = ref('')
  const status = ref('')
  const department = ref('')
  watch(
    () => route.query,
    (query) => {
      if (query.status === 'pending') {
        status.value = 'pending'
        scope.value = query.scope === 'mine' ? 'mine' : 'all'
        department.value = typeof query.department === 'string' ? query.department : ''
      }
    },
    { immediate: true }
  )
  const editing = ref(false)
  const selected = ref<DemoDemand>()
  const detail = ref<DemoDemand>()
  const review = ref<DemoDemand>()
  const showDemand = (id: string) => {
    detail.value = prototypeStore.visibleDemands.find((d) => d.id === id)
  }
  watch(
    () => prototypeStore.currentUser.id,
    () => {
      scope.value = prototypeStore.currentUser.role === 'business' ? 'mine' : 'all'
      keyword.value = ''
      status.value = ''
      department.value = ''
      editing.value = false
      selected.value = undefined
      detail.value = undefined
      review.value = undefined
    }
  )
  const departments = computed(() => [
    ...new Set(prototypeStore.database?.demands.map((d) => d.department) || [])
  ])
  const prototypeDemands = computed(() =>
    (prototypeStore.database?.demands || [])
      .filter(
        (d) =>
          (scope.value === 'all' || d.submitterId === prototypeStore.currentUser.id) &&
          (!status.value || d.status === status.value) &&
          (!department.value || d.department === department.value) &&
          (!keyword.value.trim() ||
            `${d.name} ${d.id}`.toLowerCase().includes(keyword.value.trim().toLowerCase()))
      )
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  )
  const {
    data: statistics,
    loading,
    error,
    retry
  } = useLiveQuery<DemandStatistics>('/demand-statistics', () => ({
    scope: scope.value,
    keyword: keyword.value,
    status: status.value,
    department: department.value
  }))
  const demands = computed(() =>
    runtimeConfig.isPrototype ? prototypeDemands.value : (statistics.value?.demands ?? [])
  )
  const userName = (id: string) =>
    prototypeStore.database?.users.find((user) => user.id === id)?.name || id
  const canEdit = (demand: DemoDemand) =>
    demand.submitterId === prototypeStore.currentUser.id &&
    ['draft', 'pending', 'returned', 'withdrawn'].includes(demand.status)
  function openEditor(demand?: DemoDemand) {
    selected.value = demand
    editing.value = true
  }
  function openProject(demandId: string) {
    const project = linkedProject(demandId)
    if (project) router.push({ path: '/project-overview', query: { projectId: project.id } })
  }
  const pendingCount = computed(
    () => demands.value.filter((demand) => demand.status === 'pending').length
  )
  const establishedCount = computed(
    () => demands.value.filter((demand) => demand.status === 'established').length
  )
  const metrics = computed(() => [
    { label: '当前范围需求', value: demands.value.length, icon: 'ri:file-list-3-line' },
    { label: '待评估', value: pendingCount.value, icon: 'ri:timer-line' },
    { label: '已立项', value: establishedCount.value, icon: 'ri:checkbox-circle-line' },
    {
      label: '关联在途项目',
      value: demands.value.filter((d) => {
        const p = linkedProject(d.id)
        return p?.status === 'active' && !p.archived
      }).length,
      icon: 'ri:git-branch-line'
    }
  ])
  const demandStatusLabel: Record<DemandStatus, string> = {
    draft: '草稿',
    rejected: '不予立项',
    pending: '待评估',
    returned: '退回补充',
    established: '已立项',
    withdrawn: '已撤回'
  }
  const demandStatusText = (status: DemandStatus) => demandStatusLabel[status]
  const demandStatusType = (status: DemandStatus) =>
    status === 'established' ? 'success' : status === 'pending' ? 'warning' : 'info'
  const linkedProject = (demandId: string) =>
    (prototypeStore.database?.projects || []).find((project) => project.demandId === demandId)
  const projectResult = (demandId: string) => {
    const project = linkedProject(demandId)
    if (!project) return '尚未转为项目'
    const state = { active: '进行中', completed: '已完成', cancelled: '已取消' }[project.status]
    return `已转 ${project.id} · ${project.stage} · ${state}${project.archived ? ' · 已归档' : ''}`
  }
  const formatDate = (value: string) => value || '—'
  const formatDateTime = displayTime
  return {
    prototypeStore,
    scope,
    keyword,
    status,
    department,
    departments,
    demands,
    metrics,
    editing,
    selected,
    detail,
    review,
    showDemand,
    userName,
    canEdit,
    openEditor,
    openProject,
    demandStatusLabel,
    demandStatusText,
    demandStatusType,
    linkedProject,
    projectResult,
    formatDate,
    formatDateTime,
    statistics,
    loading,
    error,
    retry
  }
}
