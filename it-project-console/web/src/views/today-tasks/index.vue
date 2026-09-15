<template>
  <BusinessPageState>
    <div>
      <div class="mb-5"
        ><h2 class="text-xl font-medium">{{ heading }}</h2
        ><p class="mt-1.5 text-sm text-g-500"
          >{{ store.currentUser.role === 'manager' ? '优先处理立项与优化审批，其次处理其他事项及项目异常' : '按职责处理验收、项目进展及补充事项；无需每日重复填报' }}</p
        ></div
      >
      <ElTabs v-model="category" v-if="store.currentUser.role === 'manager'">
        <ElTabPane :label="'全部 ' + actionable.length" name="all" />
        <ElTabPane v-for="group in groups" :key="group.key" :label="group.label + ' ' + group.rows.length" :name="group.key" />
      </ElTabs>
      <ElAlert v-if="error" :title="error" type="error" :closable="false"><ElButton @click="retry">重新加载</ElButton></ElAlert>
      <ElSkeleton v-if="loading" :rows="4" animated />
      <div v-for="group in visibleGroups" :key="group.key" class="art-card p-5 mb-5">
        <div class="art-card-header mb-3"><div class="title"><h4>{{ group.label }} <ElTag size="small">{{ group.rows.length }}</ElTag></h4><p class="text-xs text-g-500 mt-2">{{ group.hint }}</p></div></div>
        <p v-if="!group.rows.length && !loading" class="py-3 text-sm text-g-500">{{ store.currentUser.role === 'manager' ? '当前分类暂无待处理事项' : '当前无待处理事项' }}</p>
        <div v-for="task in group.rows" :key="task.action + task.id" class="task-row" :data-task-id="task.id">
          <div>
            <h3 class="font-medium"><ElTag size="small" :type="isOptimization(task) ? 'warning' : 'primary'" class="mr-2">{{ isOptimization(task) ? '项目优化' : '正式项目' }}</ElTag>{{ task.name }}</h3>
            <p class="text-xs text-g-500 mt-2">{{ metadata(task) }}</p>
            <p v-if="parentName(task)" class="text-xs text-g-500 mt-2">所属原项目：{{ parentName(task) }}</p>
            <p v-if="group.key === 'approval'" class="text-sm mt-2 text-g-600">{{ task.action === 'reassess' ? '重新评估 · ' : '' }}{{ isOptimization(task) ? '待优化审批' : '待立项审批' }} · 已等待 {{ waitingDays(task) }} 个工作日</p>
            <div v-else-if="group.key === 'risk'" class="mt-2">
              <div class="flex flex-wrap gap-2"><ElTag v-for="reason in task.reason.split('；')" :key="reason" :type="reason.includes('延期') || reason.includes('阻塞') ? 'danger' : 'warning'" size="small">{{ reason.length > 32 ? reason.slice(0, 32) + '…' : reason }}</ElTag></div>
              <details v-if="task.reason.split('；').some(reason => reason.length > 32)" class="mt-2 text-sm text-g-600"><summary class="cursor-pointer">展开异常说明</summary><p class="mt-2">{{ task.reason }}</p></details>
            </div>
            <p v-else class="text-sm mt-2 text-g-600">{{ task.reason }}</p>
          </div>
          <ElButton type="primary" :plain="group.key !== 'approval'" @click="act(task)">{{ task.action === 'review' ? isOptimization(task) ? '优化审批' : '立项审批' : actionLabels[task.action] }}</ElButton>
        </div>
      </div>
      <ElCollapse v-if="followups.length && category === 'all'" class="art-card px-5 mb-5">
        <ElCollapseItem name="followup" :title="'跟进信息 ' + followups.length + ' · 等待工程师接单，不计入待处理数量'">
          <div v-for="task in followups" :key="task.id" class="task-row"><div><h3><ElTag size="small" class="mr-2" :type="isOptimization(task) ? 'warning' : 'primary'">{{ isOptimization(task) ? '项目优化' : '正式项目' }}</ElTag>{{ task.name }}</h3><p class="text-sm text-g-500 mt-2">{{ task.reason }}</p></div><ElButton @click="act(task)">查看待接单</ElButton></div>
        </ElCollapseItem>
      </ElCollapse>
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
  import { workdaysBetween } from '@/services/risk-service'
  import { shanghaiDay } from '@/services/workflow-validation'
  import { currentDate } from '@/utils/project-display'
  import { runtimeConfig } from '@/config/runtime'
  import { useLiveQuery } from '@/hooks/business/use-live-query'
  import { useRetainedSelection } from '@/hooks/business/use-retained-selection'
  import type { DashboardResult } from '@/services/live-dashboard-types'
  import BusinessPageState from '@/components/system/business-page-state.vue'
  import { computed, ref, watch } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import {
    responsibilityTasks,
    compareTasks,
    taskCategory,
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
      .sort((a, b) => compareTasks(a, b, store.currentUser.role === 'manager'))
  })
  const tasks = computed(() =>
    route.query.status === 'pending' && store.database
      ? filterPendingTasks(
          taskRows.value,
          store.database,
          store.currentUser.id,
          String(route.query.scope ?? 'all'),
          String(route.query.department ?? ''),
          String(route.query.projectType ?? '')
        )
      : taskRows.value
  )
  const category = ref('all')
  const taskDemand = (task: ResponsibilityTask) => store.visibleDemands.find(d => d.id === task.demandId || d.id === store.database?.projectProposals?.find(p => p.id === task.proposalId)?.demandId)
  const taskProject = (task: ResponsibilityTask) => store.visibleProjects.find(p => p.id === task.projectId)
  const isOptimization = (task: ResponsibilityTask) => !!(taskDemand(task)?.parentProjectId || taskProject(task)?.parentProjectId)
  const parentName = (task: ResponsibilityTask) => store.visibleProjects.find(p => p.id === (taskDemand(task)?.parentProjectId || taskProject(task)?.parentProjectId))?.name
  const enteredAt = (task: ResponsibilityTask) => task.enteredAt || ''
  const waitingDays = (task: ResponsibilityTask) => enteredAt(task) ? workdaysBetween(shanghaiDay(enteredAt(task)), currentDate()) : 0
  const metadata = (task: ResponsibilityTask) => {
    const demand = taskDemand(task), project = taskProject(task)
    if (demand) return demand.department + ' · 提出人：' + (store.database?.users.find(u => u.id === demand.submitterId)?.name || '未设置') + ' · 提交于 ' + demand.submittedAt.slice(0,10)
    return (project?.code || '') + ' · 主负责人：' + (store.database?.users.find(u => u.id === project?.primaryOwnerId)?.name || '未设置')
  }
  const followups = computed(() => store.currentUser.role === 'manager' ? tasks.value.filter(t => t.action === 'proposal') : [])
  const actionable = computed(() => tasks.value.filter(t => !followups.value.includes(t)))
  const groups = computed(() => store.currentUser.role !== 'manager' ? [{key:'personal',label:'待处理事项',hint:'按职责处理，无需每日重复填报',rows:tasks.value}] : [
    {key:'approval', label:'待审批事项', hint:'正式项目立项与项目优化分开标识，按等待时间排序', rows:actionable.value.filter(t => taskCategory(t) === 'approval')},
    {key:'other', label:'其他待处理', hint:'需要你验收确认或补充的事项', rows:actionable.value.filter(t => taskCategory(t) === 'other')},
    {key:'risk', label:'项目异常', hint:'按延期、阻塞、未更新、临期排序', rows:actionable.value.filter(t => taskCategory(t) === 'risk')}
  ])
  const visibleGroups = computed(() => groups.value.filter(g => category.value === 'all' || category.value === g.key))
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
      category.value = 'all'
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
