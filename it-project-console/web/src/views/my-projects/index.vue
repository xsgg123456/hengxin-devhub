<template>
  <div>
    <div class="flex-cb mb-5">
      <div
        ><h2 class="text-xl font-medium text-g-900">我的项目</h2
        ><p class="mt-1.5 text-sm text-g-500">同时展示主责与协作项目，项目职责清晰可见</p></div
      >
      <ElTag type="primary" effect="light" round>{{ prototypeStore.currentUser.roleLabel }}</ElTag>
    </div>
    <ElRow :gutter="20">
      <ElCol v-for="metric in metrics" :key="metric.label" :span="6">
        <div class="art-card relative flex flex-col justify-center h-30 px-5 mb-5">
          <span class="text-g-600 text-sm">{{ metric.label }}</span
          ><ArtCountTo class="text-2xl font-medium mt-2" :target="metric.value" :duration="800" />
          <div class="absolute top-0 bottom-0 right-5 m-auto size-11 rounded-xl flex-cc bg-theme/10"
            ><ArtSvgIcon :icon="metric.icon" class="text-xl text-theme"
          /></div>
        </div>
      </ElCol>
    </ElRow>
    <div class="art-card p-5">
      <div class="art-card-header mb-4"
        ><div class="title"><h4>项目清单</h4><p>仅展示当前身份参与的项目</p></div
        ><ElTag effect="plain" round>{{ projects.length }} 条记录</ElTag></div
      >
      <ElTable :data="projects" row-key="id" stripe>
        <ElTableColumn label="项目名称" min-width="220"
          ><template #default="{ row }"
            ><div class="leading-5"
              ><p class="font-medium text-g-900">{{ row.name }}</p
              ><span class="text-xs text-g-500">{{ row.id }}</span></div
            ></template
          ></ElTableColumn
        >
        <ElTableColumn label="项目关系" min-width="108"
          ><template #default="{ row }"
            ><ElTag :type="isPrimary(row) ? 'primary' : 'info'" effect="light" round>{{
              isPrimary(row) ? '主责' : '协作'
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn prop="department" label="业务部门" min-width="130" />
        <ElTableColumn prop="stage" label="当前阶段" min-width="112" />
        <ElTableColumn label="状态" min-width="108"
          ><template #default="{ row }"
            ><ElTag :type="statusType(row.simpleStatus)" effect="light" round>{{
              statusText(row.simpleStatus)
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn label="预计上线" min-width="120"
          ><template #default="{ row }">{{
            formatDate(row.expectedLaunchDate)
          }}</template></ElTableColumn
        >
        <ElTableColumn label="最新动态" min-width="220"
          ><template #default="{ row }"
            ><span :class="row.risks.length ? 'text-danger' : 'text-g-500'">{{
              row.risks[0] ?? '进度正常'
            }}</span></template
          ></ElTableColumn
        >
      </ElTable>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { DemoProject, SimpleStatus } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'

  const prototypeStore = usePrototypeStore()
  const projects = computed(() =>
    prototypeStore.visibleProjects.filter((project) => !project.archived)
  )
  const isPrimary = (project: DemoProject) =>
    project.primaryOwnerId === prototypeStore.currentUser.id
  const primaryCount = computed(() => projects.value.filter(isPrimary).length)
  const collaboratorCount = computed(() => projects.value.length - primaryCount.value)
  const blockedCount = computed(
    () => projects.value.filter((project) => project.simpleStatus === 'blocked').length
  )
  const metrics = computed(() => [
    { label: '参与项目', value: projects.value.length, icon: 'ri:folder-user-line' },
    { label: '主责项目', value: primaryCount.value, icon: 'ri:user-star-line' },
    { label: '协作项目', value: collaboratorCount.value, icon: 'ri:team-line' },
    { label: '存在阻塞', value: blockedCount.value, icon: 'ri:error-warning-line' }
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
</script>
