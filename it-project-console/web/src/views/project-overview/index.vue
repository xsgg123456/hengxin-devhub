<template>
  <BusinessPageState>
    <div>
      <div class="page-heading mb-5">
        <div
          ><h2 class="text-xl font-medium text-g-900">{{ heading }}</h2
          ><p class="mt-1.5 text-sm text-g-500"
            >查看项目进度、关键日期与风险，按项目职责更新</p
          ></div
        >
        <div class="heading-actions"
          ><ElRadioGroup v-model="scope" aria-label="项目范围"
            ><ElRadioButton value="mine">我负责 / 参与</ElRadioButton
            ><ElRadioButton value="all">全部项目</ElRadioButton></ElRadioGroup
          ><ElButton
            v-if="store.currentUser.role === 'manager'"
            @click="router.push('/manager-grants')"
            >管理人员名单</ElButton
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
          <ElFormItem label="搜索项目"
            ><ElInput
              v-model="keyword"
              placeholder="项目名称、编号、负责人或部门"
              clearable
              style="width: 250px"
          /></ElFormItem>
          <ElFormItem label="需求部门"
            ><ElSelect
              v-model="department"
              aria-label="需求部门"
              clearable
              placeholder="全部部门"
              style="width: 150px"
              ><ElOption
                v-for="item in departments"
                :key="item"
                :label="item"
                :value="item" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="当前环节"
            ><ElSelect
              v-model="stage"
              aria-label="当前环节"
              clearable
              placeholder="全部环节"
              style="width: 145px"
              ><ElOption
                v-for="item in PROJECT_STAGES"
                :key="item"
                :label="item"
                :value="item" /></ElSelect
          ></ElFormItem>
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
              ><ElOption
                v-for="u in engineers"
                :key="u.id"
                :label="u.name"
                :value="u.id" /></ElSelect
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
      <div class="overview-charts mb-5"
        ><ProjectDistribution
          :projects="projects"
          :users="store.database?.users ?? []"
          @select="openDetail" /><PersonWorkload
          :projects="projects"
          :users="store.database?.users ?? []"
          @detail="openDetail"
      /></div>
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
  </BusinessPageState>
</template>
<script setup lang="ts">
  import BusinessPageState from '@/components/system/business-page-state.vue'
  import { computed, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { useProjectOverviewFilters } from '@/hooks/business/use-project-overview-filters'
  import { PROJECT_STAGES } from '@/domain/prototype'
  import ProjectDistribution from './modules/project-distribution.vue'
  import PersonWorkload from './modules/person-workload.vue'
  import ProjectCard from '@/components/project/project-card.vue'
  import ProjectDetailDrawer from '@/components/project/project-detail-drawer.vue'
  import ProgressUpdateDrawer from '@/components/project/progress-update-drawer.vue'
  import ProjectCreateDrawer from '@/components/project/project-create-drawer.vue'
  const props = defineProps<{ personal?: boolean }>()
  const store = usePrototypeStore()
  const route = useRoute()
  const router = useRouter()
  const {
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
  } = useProjectOverviewFilters(props.personal)
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
