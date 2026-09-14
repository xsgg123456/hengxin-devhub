import { projectCode } from '@/utils/project-code'
import { acceptanceLabel } from '@/services/acceptance-service'
import { runtimeConfig } from '@/config/runtime'
import { useLiveQuery } from './use-live-query'
import { useDemandDeepLink } from './use-demand-deep-link'
import type { DemandStatistics } from '@/services/live-dashboard-types'
import { demandCompletion, completionLabels } from '@/services/demand-completion'
import { shanghaiDay } from '@/services/workflow-validation'
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
  const dateRange = ref<[string, string] | null>(null)
  const completion = ref('')
  const status = ref('')
  const department = ref('')
  watch(
    () => route.query,
    (query) => {
      if (
        typeof query.status === 'string' &&
        ['pending', 'awaiting_engineer', 'returned_management', 'pre_establishment'].includes(
          query.status
        )
      ) {
        status.value = query.status
        scope.value = query.scope === 'mine' ? 'mine' : 'all'
        department.value = typeof query.department === 'string' ? query.department : ''
      }
    },
    { immediate: true }
  )
  const editing = ref(false)
  const selected = ref<DemoDemand>()
  const detail = ref<DemoDemand>()
  const { deepLinkError, closeDetail } = useDemandDeepLink(
    () => route.query.demandId,
    () => prototypeStore.visibleDemands,
    detail,
    () => {
      const { demandId: _demandId, ...query } = route.query
      void router.replace({ query })
    }
  )
  const review = ref<DemoDemand>()
  const showDemand = (id: string) => {
    detail.value = prototypeStore.visibleDemands.find((d) => d.id === id)
  }
  watch(
    () => prototypeStore.currentUser.id,
    () => {
      scope.value = prototypeStore.currentUser.role === 'business' ? 'mine' : 'all'
      dateRange.value = null
      completion.value = ''
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
      .map((d) => ({ ...d, ...demandCompletion(linkedProject(d.id)) }))
      .filter(
        (d) =>
          (scope.value === 'all' || d.submitterId === prototypeStore.currentUser.id) &&
          (!status.value ||
            (status.value === 'pre_establishment'
              ? ['pending', 'awaiting_engineer'].includes(d.status)
              : status.value === 'returned_management'
                ? prototypeStore.database?.projectProposals?.some(
                    (p) => p.demandId === d.id && p.status === 'returned'
                  )
                : d.status === status.value)) &&
          (!department.value || d.department === department.value) &&
          (!dateRange.value?.length ||
            (!!d.submittedAt &&
              shanghaiDay(d.submittedAt) >= dateRange.value[0] &&
              shanghaiDay(d.submittedAt) <= dateRange.value[1])) &&
          (!completion.value || d.completionStatus === completion.value)
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
    from: dateRange.value?.[0],
    to: dateRange.value?.[1],
    completion: completion.value,
    status: status.value,
    department: department.value
  }))
  const demands = computed(() =>
    runtimeConfig.isPrototype ? prototypeDemands.value : (statistics.value?.demands ?? [])
  )
  const hasFilters = computed(
    () => !!(status.value || department.value || completion.value || dateRange.value?.length)
  )
  function resetFilters() {
    status.value = ''
    department.value = ''
    completion.value = ''
    dateRange.value = null
  }
  const userName = (id: string) =>
    prototypeStore.database?.users.find((user) => user.id === id)?.name || id
  const canEdit = (demand: DemoDemand) =>
    demand.submitterId === prototypeStore.currentUser.id &&
    ['draft', 'pending', 'returned', 'withdrawn'].includes(demand.status) &&
    !(prototypeStore.database?.projectProposals ?? []).some(
      (p) => p.demandId === demand.id && p.status !== 'confirmed'
    )
  function openReview(demand: DemoDemand) {
    const proposal = prototypeStore.database?.projectProposals?.find(
      (p) => p.demandId === demand.id && p.status === 'returned'
    )
    if (proposal) void router.push({ path: '/today-tasks', query: { proposalId: proposal.id } })
    else review.value = demand
  }
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
    {
      label: '待工程师确认',
      value: demands.value.filter((d) => d.status === 'awaiting_engineer').length,
      icon: 'ri:user-follow-line'
    },
    { label: '已立项', value: establishedCount.value, icon: 'ri:checkbox-circle-line' },
    {
      label: '关联在途项目',
      value: !runtimeConfig.isPrototype
        ? (statistics.value?.activeProjectCount ?? 0)
        : demands.value.filter((d) => {
            const p = linkedProject(d.id)
            return p?.status === 'active' && !p.archived
          }).length,
      icon: 'ri:git-branch-line'
    }
  ])
  const demandStatusLabel: Record<
    DemandStatus | 'returned_management' | 'pre_establishment',
    string
  > = {
    pre_establishment: '待立项（评估/确认）',
    returned_management: '退回管理评估',
    awaiting_engineer: '待工程师确认',
    draft: '草稿',
    rejected: '不予立项',
    pending: '待评估',
    returned: '退回补充',
    established: '已立项',
    withdrawn: '已撤回'
  }
  const demandStatusText = (status: DemandStatus, id?: string) =>
    status === 'pending' &&
    prototypeStore.database?.projectProposals?.some(
      (p) => p.demandId === id && p.status === 'returned'
    )
      ? '退回管理评估'
      : demandStatusLabel[status]
  const demandStatusType = (status: DemandStatus) =>
    status === 'established' ? 'success' : status === 'pending' ? 'warning' : 'info'
  const linkedProject = (demandId: string) =>
    (prototypeStore.database?.projects || []).find((project) => project.demandId === demandId)
  const projectResult = (demandId: string) => {
    const project = linkedProject(demandId)
    if (!project) {
      const proposal = prototypeStore.database?.projectProposals?.find(
        (p) => p.demandId === demandId
      )
      return proposal?.status === 'returned'
        ? '工程师退回管理评估：' + proposal.reviewReason
        : proposal?.status === 'pending'
          ? '待主负责工程师确认'
          : '尚未转为项目'
    }
    const state = { active: '进行中', completed: '已完成', cancelled: '已取消' }[project.status]
    return `已转 ${projectCode(project)} · ${project.stage} · ${state}${project.stage === '验收交付' ? ' · ' + acceptanceLabel(project) : ''}${project.archived ? ' · 已归档' : ''}`
  }
  const formatDate = (value: string) => value || '—'
  const formatDateTime = displayTime
  return {
    prototypeStore,
    scope,
    dateRange,
    completion,
    completionLabels,
    resetFilters,
    hasFilters,
    status,
    department,
    departments,
    demands,
    metrics,
    editing,
    selected,
    detail,
    deepLinkError,
    closeDetail,
    review,
    showDemand,
    userName,
    canEdit,
    openEditor,
    openReview,
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
