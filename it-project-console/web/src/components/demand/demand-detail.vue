<template>
  <ElDrawer
    :model-value="true"
    :title="`需求详情 · ${demand.name}`"
    size="760px"
    append-to-body
    @close="emit('close')"
  >
    <ElDescriptions :column="2" border class="mb-5">
      <ElDescriptionsItem label="需求编号">{{ demandCode(demand) }}</ElDescriptionsItem>
      <ElDescriptionsItem label="需求部门">{{ demand.department }}</ElDescriptionsItem>
      <ElDescriptionsItem label="提出人">{{ submitter }}</ElDescriptionsItem>
      <ElDescriptionsItem label="需求首次提出日期">{{ demand.firstRequestedOn || '待核实' }}</ElDescriptionsItem>
      <ElDescriptionsItem :label="demand.parentProjectId ? '期望完成' : '期望上线'">{{
        demand.expectedLaunchDate || '未填写'
      }}</ElDescriptionsItem>
    </ElDescriptions>
    <p v-if="demand.parentProjectId" class="mb-3">优化需求 · 原项目：<ElButton link type="primary" @click="router.push({ path: '/project-overview', query: { projectId: demand.parentProjectId! } })">{{ store.visibleProjects.find(p => p.id === demand.parentProjectId)?.name || '查看原项目' }}</ElButton></p>
    <h3 class="font-medium mb-2">{{ demand.parentProjectId ? '当前问题' : '项目说明' }}</h3
    ><p class="mb-5 whitespace-pre-wrap break-all">{{ demand.description || '暂无说明' }}</p>
    <ElAlert
      v-if="demand.reviewReason"
      :title="
        demand.reviewReason.startsWith('工程师退回管理评估：')
          ? demand.reviewReason
          : `${demand.status === 'rejected' ? (demand.parentProjectId ? '优化未通过原因' : '不予立项原因') : demand.status === 'pending' ? '工程师退回管理评估' : '退回原因'}：${demand.reviewReason}`
      "
      type="warning"
      :closable="false"
      class="mb-5"
    />
    <p v-if="demand.parentProjectId" class="mb-5 whitespace-pre-wrap">期望效果 / 验收标准：{{ demand.optimizationOutcome }}</p>
    <MaterialSummary :demand="demand" />
    <LifecycleHistory :demand-id="demand.id" />
    <template #footer
      ><DemandLifecycleActions :demand="demand" @deleted="emit('close')" /><ElButton
        @click="emit('close')"
        >关闭</ElButton
      ></template
    >
  </ElDrawer>
</template>
<script setup lang="ts">
  import { demandCode } from '@/utils/demand-code'
  import { computed } from 'vue'
  import type { DemoDemand } from '@/domain/prototype'
  import { useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import DemandLifecycleActions from './demand-lifecycle-actions.vue'
  import MaterialSummary from './material-summary.vue'
  import LifecycleHistory from '@/components/project/lifecycle-history.vue'
  const props = defineProps<{ demand: DemoDemand }>()
  const emit = defineEmits<{ close: [] }>()
  const store = usePrototypeStore()
  const router = useRouter()
  const submitter = computed(
    () =>
      store.database?.users.find((user) => user.id === props.demand.submitterId)?.name ||
      '未知人员'
  )
</script>
