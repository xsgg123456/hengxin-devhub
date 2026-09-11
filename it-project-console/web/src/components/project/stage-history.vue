<template>
  <section class="mt-6">
    <h4 class="mb-4 font-medium">七环节计划与执行</h4>
    <ElTable :data="rows" size="small">
      <ElTableColumn prop="stage" label="环节" min-width="90" />
      <ElTableColumn label="计划区间" min-width="220"
        ><template #default="{ row }">
          <span>{{ row.plan ? `${row.plan.startDate} → ${row.plan.endDate}` : '—' }}</span>
          <p
            v-if="
              row.plan &&
              (row.plan.originalStartDate || row.plan.originalEndDate) &&
              (row.plan.originalStartDate !== row.plan.startDate ||
                row.plan.originalEndDate !== row.plan.endDate)
            "
            class="text-xs text-g-600"
            >原计划 {{ row.plan.originalStartDate || '—' }} →
            {{ row.plan.originalEndDate || '—' }}</p
          >
        </template></ElTableColumn
      >
      <ElTableColumn label="状态" min-width="140"
        ><template #default="{ row }"
          ><ElTag
            size="small"
            :type="
              row.state === 'late' || row.state === 'late-done'
                ? 'danger'
                : row.state === 'done'
                  ? 'success'
                  : row.current
                    ? 'primary'
                    : 'info'
            "
            >{{ row.label }}{{ row.lateDays ? ` ${row.lateDays}天` : '' }}</ElTag
          ></template
        ></ElTableColumn
      >
      <ElTableColumn label="实际完成日" min-width="120"
        ><template #default="{ row }">{{
          row.completedAt ? displayTime(row.completedAt).slice(0, 10) : '—'
        }}</template></ElTableColumn
      >
    </ElTable>
    <details v-if="histories.length" class="mt-3 text-sm">
      <summary class="cursor-pointer text-g-600">查看全部阶段历史</summary>
      <p v-for="(history, index) in histories" :key="index" class="mt-2">
        {{ history.stage }} · 进入 {{ displayTime(history.startedAt) }} ·
        {{
          history.interruptedAt
            ? `纠正离开，未完成（${displayTime(history.interruptedAt)}）`
            : history.completedAt === null
              ? '尚未完成'
              : `完成 ${displayTime(history.completedAt)}`
        }}
      </p>
    </details>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { stageExecutions } from '@/services/stage-execution'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { displayTime } from '@/utils/project-display'
  const props = defineProps<{ projectId: string }>()
  const store = usePrototypeStore()
  const project = computed(() => store.visibleProjects.find((p) => p.id === props.projectId))
  const histories = computed(
    () => store.database?.stageHistories.filter((h) => h.projectId === props.projectId) ?? []
  )
  const rows = computed(() =>
    project.value ? stageExecutions(project.value, histories.value) : []
  )
</script>
