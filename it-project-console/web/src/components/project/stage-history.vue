<template>
  <section class="mt-6"
    ><h4 class="mb-4 font-medium">阶段时间线</h4>
    <ElTable :data="histories" size="small" empty-text="暂无阶段历史">
      <ElTableColumn prop="stage" label="阶段" min-width="90" />
      <ElTableColumn label="进入时间" min-width="150"
        ><template #default="{ row }">{{ displayTime(row.startedAt) }}</template></ElTableColumn
      >
      <ElTableColumn label="完成时间" min-width="150"
        ><template #default="{ row }">{{
          row.interruptedAt
            ? `纠正离开，未完成（${displayTime(row.interruptedAt)}）`
            : row.completedAt === null
              ? '尚未完成'
              : displayTime(row.completedAt)
        }}</template></ElTableColumn
      >
    </ElTable>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { displayTime } from '@/utils/project-display'
  const props = defineProps<{ projectId: string }>()
  const store = usePrototypeStore()
  const histories = computed(
    () => store.database?.stageHistories.filter((h) => h.projectId === props.projectId) ?? []
  )
</script>
