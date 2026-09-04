<template>
  <div>
    <div class="flex-cb mb-5">
      <div
        ><h2 class="text-xl font-medium text-g-900">我的需求</h2
        ><p class="mt-1.5 text-sm text-g-500">查看本部门提交的需求，以及转项目后的推进状态</p></div
      >
      <ElTag type="primary" effect="light" round
        >{{ prototypeStore.currentUser.department }} · 部门范围</ElTag
      >
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
        ><div class="title"><h4>需求清单</h4><p>按提交时间从新到旧排列</p></div
        ><ElTag effect="plain" round>{{ demands.length }} 条记录</ElTag></div
      >
      <ElTable :data="demands" row-key="id" stripe>
        <ElTableColumn label="需求名称" min-width="240"
          ><template #default="{ row }"
            ><div class="leading-5"
              ><p class="font-medium text-g-900">{{ row.name }}</p
              ><span class="text-xs text-g-500">{{ row.id }}</span></div
            ></template
          ></ElTableColumn
        >
        <ElTableColumn prop="department" label="提出部门" min-width="140" />
        <ElTableColumn label="需求状态" min-width="116"
          ><template #default="{ row }"
            ><ElTag :type="demandStatusType(row.status)" effect="light" round>{{
              demandStatusText(row.status)
            }}</ElTag></template
          ></ElTableColumn
        >
        <ElTableColumn label="期望上线" min-width="130"
          ><template #default="{ row }">{{
            formatDate(row.expectedLaunchDate)
          }}</template></ElTableColumn
        >
        <ElTableColumn label="提交时间" min-width="150"
          ><template #default="{ row }">{{
            formatDateTime(row.submittedAt)
          }}</template></ElTableColumn
        >
        <ElTableColumn label="推进结果" min-width="230"
          ><template #default="{ row }"
            ><span :class="linkedProject(row.id) ? 'text-theme' : 'text-g-500'">{{
              projectResult(row.id)
            }}</span></template
          ></ElTableColumn
        >
      </ElTable>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { DemandStatus } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'

  const prototypeStore = usePrototypeStore()
  const demands = computed(() =>
    [...prototypeStore.visibleDemands].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  )
  const pendingCount = computed(
    () => demands.value.filter((demand) => demand.status === 'pending').length
  )
  const establishedCount = computed(
    () => demands.value.filter((demand) => demand.status === 'established').length
  )
  const metrics = computed(() => [
    { label: '全部需求', value: demands.value.length, icon: 'ri:file-list-3-line' },
    { label: '待受理', value: pendingCount.value, icon: 'ri:timer-line' },
    { label: '已立项', value: establishedCount.value, icon: 'ri:checkbox-circle-line' },
    {
      label: '关联在途项目',
      value: prototypeStore.visibleProjects.length,
      icon: 'ri:git-branch-line'
    }
  ])
  const demandStatusLabel: Record<DemandStatus, string> = {
    pending: '待受理',
    returned: '已退回',
    established: '已立项',
    withdrawn: '已撤回'
  }
  const demandStatusText = (status: DemandStatus) => demandStatusLabel[status]
  const demandStatusType = (status: DemandStatus) =>
    status === 'established' ? 'success' : status === 'pending' ? 'warning' : 'info'
  const linkedProject = (demandId: string) =>
    prototypeStore.visibleProjects.find((project) => project.demandId === demandId)
  const projectResult = (demandId: string) => {
    const project = linkedProject(demandId)
    return project ? `已转 ${project.id} · ${project.stage}` : '尚未转为项目'
  }
  function formatDate(value: string): string {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(`${value}T00:00:00+08:00`))
  }
  function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value))
  }
</script>
