<template>
  <BusinessPageState>
    <div>
      <div class="mb-5"
        ><h2 class="text-xl font-medium">{{ heading }}</h2
        ><p class="mt-1.5 text-sm text-g-500"
          >按职责处理评估、项目异常及补充事项；无需每日重复填报</p
        ></div
      >
      <div class="art-card p-5">
        <div class="art-card-header mb-4"
          ><div class="title"><h4>待处理事项</h4></div
          ><ElTag>{{ tasks.length }} 项</ElTag></div
        >
        <ElAlert v-if="error" :title="error" type="error" :closable="false"
          ><ElButton @click="retry">重新加载</ElButton></ElAlert
        >
        <ElSkeleton v-if="loading" :rows="4" animated />
        <ElEmpty v-if="!loading && !error && !tasks.length" description="当前无待处理事项" />
        <div v-for="task in tasks" :key="task.id" class="task-row" :data-task-id="task.id">
          <div
            ><h3 class="font-medium">{{ task.name }}</h3
            ><p class="text-xs text-g-500 mt-1">{{ task.code || task.id }}</p
            ><p class="text-sm mt-2" :class="task.severity < 3 ? 'text-danger' : 'text-g-600'">{{
              task.reason
            }}</p></div
          >
          <ElButton type="primary" plain @click="act(task)">{{
            actionLabels[task.action]
          }}</ElButton>
        </div>
      </div>
      <ElAlert v-if="proposalError" :title="proposalError" type="warning" :closable="false" />
      <ProjectCreateDrawer
        v-if="proposal"
        :key="proposal.id"
        :model-value="true"
        :proposal="proposal"
        @update:model-value="closeProposal"
      />
      <ProjectDetailDrawer v-model="detailOpen" :project="selected" @edit="openUpdate" />
      <ProgressUpdateDrawer v-model="updateOpen" :project="updateProject" />
      <DemandReview v-if="review" :demand="review" @close="reviewId = ''" @saved="reviewId = ''" />
      <DemandEditor
        v-if="supplement"
        :demand="supplement"
        @close="supplementId = ''"
        @saved="supplementId = ''"
      />
    </div>
  </BusinessPageState>
</template>
<script setup lang="ts">
  import { runtimeConfig } from '@/config/runtime'
  import { useLiveQuery } from '@/hooks/business/use-live-query'
  import { useRetainedSelection } from '@/hooks/business/use-retained-selection'
  import type { DashboardResult } from '@/services/live-dashboard-types'
  import BusinessPageState from '@/components/system/business-page-state.vue'
  import { computed, ref, watch } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import {
    responsibilityTasks,
    filterPendingTasks,
    type ResponsibilityTask
  } from '@/services/task-service'
  import ProjectDetailDrawer from '@/components/project/project-detail-drawer.vue'
  import ProgressUpdateDrawer from '@/components/project/progress-update-drawer.vue'
  import DemandReview from '@/components/demand/demand-review.vue'
  import DemandEditor from '@/components/demand/demand-editor.vue'
  import ProjectCreateDrawer from '@/components/project/project-create-drawer.vue'
  import { useRoute, useRouter } from 'vue-router'
  const route = useRoute(),
    router = useRouter()
  const store = usePrototypeStore()
  const proposalId = ref('')
  const proposal = useRetainedSelection(() => proposalId.value, () => store.database?.projectProposals ?? [])
  const proposalError = computed(() =>
    proposalId.value && store.ready && !proposal.value
      ? '待接单记录不存在或无权访问，请刷新待办'
      : ''
  )
  watch(
    () => route.query.proposalId,
    (id) => {
      proposalId.value = typeof id === 'string' ? id : ''
    },
    { immediate: true }
  )
  function closeProposal() {
    proposalId.value = ''
    const { proposalId: _, ...query } = route.query
    void router.replace({ query })
  }
  const heading = computed(
    () =>
      ({ manager: '今日待办', engineer: '我的待办', business: '我的待办' })[store.currentUser.role]
  )
  const { data, loading, error, retry } = useLiveQuery<DashboardResult>('/dashboard', () => ({
    scope: 'all'
  }))
  const taskRows = computed(() => {
    if (!store.database) return []
    if (runtimeConfig.isPrototype) return responsibilityTasks(store.database, store.currentUser)
    if (!data.value) return []
    const database = { ...store.database, projects: data.value.projects }
    return responsibilityTasks(database, store.currentUser)
      .map((task) => ({
        ...task,
        days: task.projectId ? (data.value!.attentionDays[task.projectId] ?? task.days) : task.days
      }))
      .sort((a, b) => a.severity - b.severity || b.days - a.days || a.id.localeCompare(b.id))
  })
  const tasks = computed(() =>
    route.query.status === 'pending' && store.database
      ? filterPendingTasks(
          taskRows.value,
          store.database,
          store.currentUser.id,
          String(route.query.scope ?? 'all'),
          String(route.query.department ?? '')
        )
      : taskRows.value
  )
  const detailId = ref(''),
    updateId = ref(''),
    reviewId = ref(''),
    supplementId = ref('')
  const detailOpen = ref(false),
    updateOpen = ref(false)
  const selected = computed(
    () => store.visibleProjects.find((p) => p.id === detailId.value) ?? null
  )
  const retainedUpdate = useRetainedSelection(() => updateId.value, () => store.visibleProjects)
  const updateProject = computed(() => retainedUpdate.value ?? null)
  const review = useRetainedSelection(() => reviewId.value, () => store.visibleDemands)
  const supplement = useRetainedSelection(() => supplementId.value, () => store.visibleDemands)
  const actionLabels = {
    acceptance: '验收确认',
    confirm: '确认接单',
    reassess: '重新评估',
    proposal: '查看待接单',
    review: '评估需求',
    supplement: '补充重提',
    overall: '更新环节',
    personal: '填写协作进展',
    coordinate: '查看并协调'
  }
  function openUpdate(id: string) {
    updateId.value = id
    updateOpen.value = true
  }
  function act(task: ResponsibilityTask) {
    if (task.proposalId) {
      proposalId.value = task.proposalId
      void router.replace({ query: { ...route.query, proposalId: task.proposalId } })
      return
    }
    if (task.action === 'review') reviewId.value = task.demandId ?? ''
    else if (task.action === 'supplement') supplementId.value = task.demandId ?? ''
    else if (task.action === 'coordinate' || task.action === 'acceptance') {
      detailId.value = task.projectId ?? ''
      detailOpen.value = true
    } else openUpdate(task.projectId ?? '')
  }
  watch(
    () => store.currentUser.id,
    () => {
      proposalId.value = ''
      detailOpen.value = false
      updateOpen.value = false
      reviewId.value = ''
      supplementId.value = ''
    }
  )
</script>
<style scoped>
  .task-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 20px 0;
    border-bottom: 1px solid var(--art-card-border);
  }
  .task-row > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .task-row > button {
    flex-shrink: 0;
  }
  .task-row:last-child {
    border-bottom: 0;
  }
</style>
