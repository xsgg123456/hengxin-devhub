<template>
  <BusinessPageState>
    <div>
      <div class="mb-5"
        ><h2 class="text-xl font-medium text-g-900">月度甘特图</h2
        ><p class="mt-1.5 text-sm text-g-500">查看整体计划、交付日期与进度，时间轴仅供查看</p></div
      >
      <div class="art-card p-5">
        <div class="month-heading mb-5">
          <ElButton aria-label="上一月" @click="month = shiftMonth(month, -1)">上一月</ElButton>
          <h3 class="text-base font-medium">{{ month }} 甘特图</h3>
          <ElButton aria-label="下一月" @click="month = shiftMonth(month, 1)">下一月</ElButton>
          <ElButton @click="month = today.slice(0, 7)">返回本月</ElButton>
          <span class="text-sm text-g-500">{{ rows.length }} 个项目</span>
        </div>
        <ElForm inline label-position="top">
          <ElFormItem label="部门"
            ><ElSelect
              v-model="department"
              clearable
              placeholder="全部部门"
              aria-label="甘特部门"
              style="width: 150px"
              ><ElOption
                v-for="item in departments"
                :key="item"
                :label="item"
                :value="item" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="主负责人"
            ><ElSelect
              v-model="ownerId"
              clearable
              placeholder="全部负责人"
              aria-label="甘特负责人"
              style="width: 150px"
              ><ElOption
                v-for="user in owners"
                :key="user.id"
                :label="user.name"
                :value="user.id" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="风险状态"
            ><ElSelect v-model="risk" aria-label="甘特风险" style="width: 150px"
              ><ElOption label="全部风险" value="all" /><ElOption
                label="存在风险"
                value="any" /><ElOption label="已延期" value="delayed" /><ElOption
                label="超期未更新"
                value="stale" /><ElOption label="已阻塞" value="blocked" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="历史范围"
            ><ElSwitch v-model="includeArchived" active-text="含归档 / 已取消"
          /></ElFormItem>
          <ElFormItem label=" "><ElButton @click="clearFilters">清除筛选</ElButton></ElFormItem>
        </ElForm>
        <ElSkeleton
          v-if="loading || !store.ready || store.snapshot?.scenario === 'loading'"
          :rows="6"
          animated
        />
        <ElAlert v-else-if="error" :title="error" type="error" :closable="false"
          ><ElButton @click="retry">重新加载</ElButton></ElAlert
        >
        <ElAlert
          v-else-if="store.corrupted || !store.database"
          title="项目数据读取失败，请刷新后重试"
          type="error"
          :closable="false"
        />
        <ElAlert
          v-else-if="store.snapshot?.scenario === 'forbidden'"
          title="当前无查看权限，请返回首页"
          type="warning"
          :closable="false"
        />
        <ElEmpty
          v-else-if="!rows.length"
          description="本月没有符合条件的项目排期，可切换月份或清除筛选"
          ><ElButton @click="clearFilters">清除筛选</ElButton></ElEmpty
        >
        <MonthlyGantt
          v-else
          :rows="rows"
          :month="month"
          :today="today"
          :users="store.database.users"
          @detail="openDetail"
        />
      </div>
      <ProjectDetailDrawer
        :model-value="detailOpen"
        :project="selected"
        @update:model-value="closeDetail"
        @edit="openUpdate"
      />
      <ProgressUpdateDrawer v-model="updateOpen" :project="updateProject" />
    </div>
  </BusinessPageState>
</template>
<script setup lang="ts">
  import { runtimeConfig } from '@/config/runtime'
  import { useLiveQuery } from '@/hooks/business/use-live-query'
  import type { GanttRow } from '@/services/gantt-service'
  import BusinessPageState from '@/components/system/business-page-state.vue'
  import { computed, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { currentDate } from '@/utils/project-display'
  import { buildGanttRows, shiftMonth } from '@/services/gantt-service'
  import MonthlyGantt from '@/components/project/monthly-gantt.vue'
  import ProjectDetailDrawer from '@/components/project/project-detail-drawer.vue'
  import ProgressUpdateDrawer from '@/components/project/progress-update-drawer.vue'
  const store = usePrototypeStore()
  const route = useRoute()
  const router = useRouter()
  const today = currentDate()
  const month = ref(today.slice(0, 7))
  const department = ref('')
  const ownerId = ref('')
  const risk = ref('all')
  const includeArchived = ref(false)
  const updateId = ref('')
  const updateOpen = ref(false)
  const departments = computed(() => [...new Set(store.visibleProjects.map((p) => p.department))])
  const owners = computed(
    () =>
      store.database?.users.filter((user) =>
        store.visibleProjects.some((p) => p.primaryOwnerId === user.id)
      ) ?? []
  )
  const prototypeRows = computed(() =>
    buildGanttRows(
      store.visibleProjects,
      month.value,
      {
        department: department.value,
        ownerId: ownerId.value,
        risk: risk.value,
        includeArchived: includeArchived.value
      },
      store.database?.scheduleChanges
    )
  )
  const { data, loading, error, retry } = useLiveQuery<GanttRow[]>('/gantt', () => ({
    month: month.value,
    department: department.value,
    ownerId: ownerId.value,
    risk: risk.value,
    includeArchived: includeArchived.value
  }))
  const rows = computed(() =>
    runtimeConfig.isPrototype ? prototypeRows.value : (data.value ?? [])
  )
  const detailOpen = computed(() => typeof route.query.projectId === 'string')
  const selected = computed(
    () => store.visibleProjects.find((p) => p.id === route.query.projectId) ?? null
  )
  const updateProject = computed(
    () => store.visibleProjects.find((p) => p.id === updateId.value) ?? null
  )
  function openDetail(id: string): void {
    void router.push({ query: { ...route.query, projectId: id } })
  }
  function closeDetail(open: boolean): void {
    if (open) return
    const query = { ...route.query }
    delete query.projectId
    void router.replace({ query })
  }
  function openUpdate(id: string): void {
    updateId.value = id
    updateOpen.value = true
  }
  function clearFilters(): void {
    department.value = ''
    ownerId.value = ''
    risk.value = 'all'
    includeArchived.value = false
  }
  watch(
    () => store.currentUser.id,
    () => {
      clearFilters()
      updateOpen.value = false
    }
  )
</script>
<style scoped>
  .month-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .month-heading .el-button + .el-button {
    margin-left: 0;
  }
</style>
