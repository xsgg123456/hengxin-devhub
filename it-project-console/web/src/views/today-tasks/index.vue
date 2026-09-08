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
        <ElEmpty v-if="!tasks.length" description="当前无待处理事项" />
        <div v-for="task in tasks" :key="task.id" class="task-row" :data-task-id="task.id">
          <div
            ><h3 class="font-medium">{{ task.name }}</h3
            ><p class="text-xs text-g-500 mt-1">{{ task.id }}</p
            ><p class="text-sm mt-2" :class="task.severity < 3 ? 'text-danger' : 'text-g-600'">{{
              task.reason
            }}</p></div
          >
          <ElButton type="primary" plain @click="act(task)">{{
            actionLabels[task.action]
          }}</ElButton>
        </div>
      </div>
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
  import BusinessPageState from '@/components/system/business-page-state.vue'
  import { computed, ref, watch } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { responsibilityTasks, type ResponsibilityTask } from '@/services/task-service'
  import ProjectDetailDrawer from '@/components/project/project-detail-drawer.vue'
  import ProgressUpdateDrawer from '@/components/project/progress-update-drawer.vue'
  import DemandReview from '@/components/demand/demand-review.vue'
  import DemandEditor from '@/components/demand/demand-editor.vue'
  const store = usePrototypeStore()
  const heading = computed(
    () =>
      ({ manager: '今日待办', engineer: '我的待办', business: '待我补充' })[store.currentUser.role]
  )
  const tasks = computed(() =>
    store.database ? responsibilityTasks(store.database, store.currentUser) : []
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
  const updateProject = computed(
    () => store.visibleProjects.find((p) => p.id === updateId.value) ?? null
  )
  const review = computed(() => store.visibleDemands.find((d) => d.id === reviewId.value))
  const supplement = computed(() => store.visibleDemands.find((d) => d.id === supplementId.value))
  const actionLabels = {
    review: '评估需求',
    supplement: '补充重提',
    overall: '更新进度',
    personal: '填写协作进展',
    coordinate: '查看并协调'
  }
  function openUpdate(id: string) {
    updateId.value = id
    updateOpen.value = true
  }
  function act(task: ResponsibilityTask) {
    if (task.action === 'review') reviewId.value = task.demandId ?? ''
    else if (task.action === 'supplement') supplementId.value = task.demandId ?? ''
    else if (task.action === 'coordinate') {
      detailId.value = task.projectId ?? ''
      detailOpen.value = true
    } else openUpdate(task.projectId ?? '')
  }
  watch(
    () => store.currentUser.id,
    () => {
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
