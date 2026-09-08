<template>
  <ElDrawer
    :model-value="true"
    :title="`需求详情 · ${demand.name}`"
    size="760px"
    append-to-body
    @close="emit('close')"
  >
    <ElDescriptions :column="2" border class="mb-5">
      <ElDescriptionsItem label="需求编号">{{ demand.id }}</ElDescriptionsItem>
      <ElDescriptionsItem label="需求部门">{{ demand.department }}</ElDescriptionsItem>
      <ElDescriptionsItem label="提出人">{{ submitter }}</ElDescriptionsItem>
      <ElDescriptionsItem label="期望上线">{{
        demand.expectedLaunchDate || '未填写'
      }}</ElDescriptionsItem>
    </ElDescriptions>
    <h3 class="font-medium mb-2">项目说明</h3
    ><p class="mb-5 whitespace-pre-wrap break-all">{{ demand.description || '暂无说明' }}</p>
    <ElAlert
      v-if="demand.reviewReason"
      :title="`${demand.status === 'rejected' ? '不予立项原因' : '退回原因'}：${demand.reviewReason}`"
      type="warning"
      :closable="false"
      class="mb-5"
    />
    <MaterialSummary :demand="demand" />
    <template #footer><ElButton @click="emit('close')">关闭</ElButton></template>
  </ElDrawer>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import type { DemoDemand } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import MaterialSummary from './material-summary.vue'
  const props = defineProps<{ demand: DemoDemand }>()
  const emit = defineEmits<{ close: [] }>()
  const store = usePrototypeStore()
  const submitter = computed(
    () =>
      store.database?.users.find((user) => user.id === props.demand.submitterId)?.name ||
      props.demand.submitterId
  )
</script>
