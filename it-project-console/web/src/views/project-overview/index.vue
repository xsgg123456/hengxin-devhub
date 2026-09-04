<template>
  <div>
    <div class="flex-cb mb-5">
      <div>
        <h2 class="text-xl font-medium text-g-900">项目运行概览</h2>
        <p class="mt-1.5 text-sm text-g-500">聚焦进度、延期与阻塞，数据更新时间 {{ updatedAt }}</p>
      </div>
      <ElTag type="primary" effect="light" round>管理视角 · 全量数据</ElTag>
    </div>

    <ElRow :gutter="20" class="flex">
      <ElCol v-for="metric in metrics" :key="metric.label" :span="metric.span">
        <div class="art-card relative flex flex-col justify-center h-32 px-5 mb-5">
          <span class="text-g-600 text-sm">{{ metric.label }}</span>
          <ArtCountTo class="text-[26px] font-medium mt-2" :target="metric.value" :duration="900" />
          <span class="mt-1 text-xs" :class="metric.copyClass">{{ metric.copy }}</span>
          <div
            class="absolute top-0 bottom-0 right-5 m-auto size-12 rounded-xl flex-cc bg-theme/10"
          >
            <ArtSvgIcon :icon="metric.icon" class="text-xl text-theme" />
          </div>
        </div>
      </ElCol>
    </ElRow>

    <div class="art-card p-5">
      <div class="art-card-header mb-4">
        <div class="title">
          <h4>在途项目</h4>
          <p>共 {{ activeProjects.length }} 个未归档项目，按最近更新时间排序</p>
        </div>
        <ElTag effect="plain" round>{{ activeProjects.length }} 条记录</ElTag>
      </div>
      <ElTable :data="activeProjects" row-key="id" stripe>
        <ElTableColumn label="项目名称" min-width="220">
          <template #default="{ row }">
            <div class="leading-5"
              ><p class="font-medium text-g-900">{{ row.name }}</p
              ><span class="text-xs text-g-500">{{ row.id }}</span></div
            >
          </template>
        </ElTableColumn>
        <ElTableColumn prop="department" label="业务部门" min-width="130" />
        <ElTableColumn prop="stage" label="当前阶段" min-width="112" />
        <ElTableColumn label="状态" min-width="108">
          <template #default="{ row }"
            ><ElTag :type="statusType(row.simpleStatus)" effect="light" round>{{
              statusText(row.simpleStatus)
            }}</ElTag></template
          >
        </ElTableColumn>
        <ElTableColumn label="预计上线" min-width="120">
          <template #default="{ row }">{{ formatDate(row.expectedLaunchDate) }}</template>
        </ElTableColumn>
        <ElTableColumn label="风险提示" min-width="230">
          <template #default="{ row }"
            ><span :class="row.risks.length ? 'text-danger' : 'text-g-500'">{{
              row.risks[0] ?? '暂无显著风险'
            }}</span></template
          >
        </ElTableColumn>
      </ElTable>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { SimpleStatus } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'

  const prototypeStore = usePrototypeStore()
  const activeProjects = computed(() =>
    [...prototypeStore.visibleProjects]
      .filter((project) => project.status === 'active' && !project.archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  )
  const updatedAt = computed(() => formatDateTime(prototypeStore.snapshot?.updatedAt ?? ''))
  const metrics = computed(() => [
    {
      label: '在途项目',
      value: prototypeStore.overviewStats.active,
      icon: 'ri:folder-open-line',
      copy: '全部进行中项目',
      copyClass: 'text-g-500',
      span: 5
    },
    {
      label: '延期项目',
      value: prototypeStore.overviewStats.delayed,
      icon: 'ri:calendar-close-line',
      copy: '需要跟进计划',
      copyClass: 'text-warning',
      span: 5
    },
    {
      label: '久未更新',
      value: prototypeStore.overviewStats.stale,
      icon: 'ri:time-line',
      copy: '超过更新周期',
      copyClass: 'text-warning',
      span: 5
    },
    {
      label: '阻塞项目',
      value: prototypeStore.overviewStats.blocked,
      icon: 'ri:error-warning-line',
      copy: '等待问题解除',
      copyClass: 'text-danger',
      span: 5
    },
    {
      label: '待受理需求',
      value: prototypeStore.overviewStats.pending,
      icon: 'ri:file-list-3-line',
      copy: '等待 IT 处理',
      copyClass: 'text-g-500',
      span: 4
    }
  ])
  const statusLabel: Record<SimpleStatus, string> = {
    'not-started': '未开始',
    'in-progress': '进行中',
    'nearly-done': '即将完成',
    completed: '已完成',
    blocked: '已阻塞'
  }
  const statusText = (status: SimpleStatus) => statusLabel[status]
  const statusType = (status: SimpleStatus) =>
    status === 'blocked'
      ? 'danger'
      : status === 'completed'
        ? 'success'
        : status === 'not-started'
          ? 'info'
          : 'primary'
  function formatDate(value: string): string {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(`${value}T00:00:00+08:00`))
  }
  function formatDateTime(value: string): string {
    return value
      ? new Intl.DateTimeFormat('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date(value))
      : '--'
  }
</script>
