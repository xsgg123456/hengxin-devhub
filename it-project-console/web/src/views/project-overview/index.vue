<template>
  <div>
    <div class="page-heading mb-5">
      <div
        ><h2 class="text-xl font-medium text-g-900">{{ heading }}</h2
        ><p class="mt-1.5 text-sm text-g-500">查看项目进度、关键日期与风险，按项目职责更新</p></div
      >
      <div class="heading-actions"
        ><ElRadioGroup v-model="scope" aria-label="项目范围"
          ><ElRadioButton value="mine">我负责 / 参与</ElRadioButton
          ><ElRadioButton value="all">全部项目</ElRadioButton></ElRadioGroup
        ><ElButton
          v-if="store.currentUser.role === 'manager'"
          type="primary"
          @click="createOpen = true"
          >直接创建项目</ElButton
        ></div
      >
    </div>
    <div class="art-card p-5 mb-5">
      <div class="art-card-header mb-4"
        ><div class="title"><h4>项目总览</h4></div
        ><span class="text-xs text-g-500">共 {{ projects.length }} 个项目</span></div
      >
      <ElForm inline label-position="top" class="filters">
        <ElFormItem label="项目状态"
          ><ElSelect v-model="status" aria-label="项目状态" style="width: 140px"
            ><ElOption label="全部状态" value="all" /><ElOption
              label="进行中"
              value="active" /><ElOption label="已完成" value="completed" /><ElOption
              label="已取消"
              value="cancelled" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="项目人员"
          ><ElSelect
            v-model="person"
            aria-label="项目人员"
            clearable
            placeholder="全部人员"
            style="width: 150px"
            ><ElOption v-for="u in engineers" :key="u.id" :label="u.name" :value="u.id" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="预计交付日期"
          ><ElDatePicker
            v-model="dates"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 245px"
        /></ElFormItem>
        <ElFormItem label="风险筛选"
          ><ElSelect v-model="riskFilter" aria-label="风险筛选" style="width: 145px"
            ><ElOption label="全部风险" value="all" /><ElOption
              label="存在风险"
              value="any" /><ElOption label="已延期" value="delayed" /><ElOption
              label="超期未更新"
              value="stale" /><ElOption label="已阻塞" value="blocked" /></ElSelect
        ></ElFormItem>
        <ElFormItem label="归档范围"
          ><ElSwitch v-model="includeArchived" active-text="含归档"
        /></ElFormItem>
        <ElFormItem label=" "><ElButton @click="clearFilters">清除筛选</ElButton></ElFormItem>
      </ElForm>
    </div>
    <div class="metrics mb-5"
      ><button
        v-for="metric in metrics"
        :key="metric.label"
        class="art-card metric"
        @click="applyMetric(metric.key)"
        ><span>{{ metric.label }}</span
        ><strong>{{ metric.value }}<small> 个</small></strong></button
      ></div
    >
    <div class="art-card p-5">
      <div class="art-card-header mb-4"
        ><div class="title"><h4>项目明细</h4></div
        ><span class="text-xs text-g-500">整体进度、日期与风险使用同一份数据</span></div
      >
      <ElEmpty v-if="!projects.length" description="当前没有符合条件的项目"
        ><ElButton @click="clearFilters">清除筛选</ElButton></ElEmpty
      >
      <div v-else class="project-grid"
        ><ProjectCard
          v-for="project in projects"
          :key="project.id"
          :project="project"
          @detail="openDetail"
          @update="openUpdate"
      /></div>
    </div>
    <ProjectDetailDrawer
      :model-value="detailOpen"
      :project="selected"
      @update:model-value="closeDetail"
      @edit="openUpdate"
    />
    <ProgressUpdateDrawer v-model="updateOpen" :project="updateProject" />
    <ProjectCreateDrawer v-model="createOpen" @created="openDetail" />
  </div>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { computeProjectRisks } from '@/services/risk-service'
  import ProjectCard from '@/components/project/project-card.vue'
  import ProjectDetailDrawer from '@/components/project/project-detail-drawer.vue'
  import ProgressUpdateDrawer from '@/components/project/progress-update-drawer.vue'
  import ProjectCreateDrawer from '@/components/project/project-create-drawer.vue'
  const props = defineProps<{ personal?: boolean }>()
  const store = usePrototypeStore()
  const route = useRoute()
  const router = useRouter()
  const scope = ref(props.personal && store.currentUser.role === 'engineer' ? 'mine' : 'all')
  const status = ref('all')
  const person = ref('')
  const dates = ref<[string, string] | null>(null)
  const riskFilter = ref('all')
  const includeArchived = ref(false)
  const updateOpen = ref(false)
  const updateId = ref('')
  const createOpen = ref(false)
  const heading = computed(() =>
    props.personal
      ? '我的项目 / 全部项目'
      : store.currentUser.role === 'business'
        ? '项目进展'
        : '项目总览'
  )
  const engineers = computed(() => store.database?.users.filter((u) => u.role === 'engineer') ?? [])
  const withRisks = computed(() =>
    store.visibleProjects.map((p) => ({
      ...p,
      risks: computeProjectRisks(p, store.database?.scheduleChanges ?? [])
    }))
  )
  const filtered = computed(() =>
    withRisks.value.filter((p) => {
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
      if (
        dates.value &&
        (p.expectedDeliveryDate < dates.value[0] || p.expectedDeliveryDate > dates.value[1])
      )
        return false
      return true
    })
  )
  const projects = computed(() =>
    filtered.value
      .filter((p) => {
        if (riskFilter.value === 'any') return p.risks.length > 0
        if (riskFilter.value === 'delayed') return p.risks.some((r) => r.includes('延期'))
        if (riskFilter.value === 'stale') return p.risks.some((r) => r.includes('未更新'))
        if (riskFilter.value === 'blocked') return p.simpleStatus === 'blocked'
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
  const metrics = computed(() => [
    {
      label: '在手项目',
      key: 'active',
      value: projects.value.filter((p) => p.status === 'active').length
    },
    {
      label: '进行中',
      key: 'active',
      value: projects.value.filter((p) => p.status === 'active').length
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
      label: '已完成',
      key: 'completed',
      value: projects.value.filter((p) => p.status === 'completed').length
    }
  ])
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
    if (!open) {
      const query = { ...route.query }
      delete query.projectId
      void router.replace({ query })
    }
  }
  function openUpdate(id: string): void {
    updateId.value = id
    updateOpen.value = true
  }
  function clearFilters(): void {
    status.value = 'all'
    person.value = ''
    dates.value = null
    riskFilter.value = 'all'
    includeArchived.value = false
  }
  function applyMetric(key: string): void {
    if (['active', 'completed'].includes(key)) {
      status.value = key
      riskFilter.value = 'all'
    } else {
      status.value = 'all'
      riskFilter.value = key
    }
  }
  watch(
    () => store.currentUser.id,
    () => {
      scope.value = props.personal && store.currentUser.role === 'engineer' ? 'mine' : 'all'
      clearFilters()
      updateOpen.value = false
      createOpen.value = false
    }
  )
</script>
<style scoped src="./style.css"></style>
