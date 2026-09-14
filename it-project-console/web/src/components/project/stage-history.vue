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
    <h4 class="mt-5 mb-3 font-medium">业务验收历史</h4>
    <p v-if="!project?.acceptanceHistory?.length" class="text-sm text-g-600">{{
      project?.status === 'completed' ? '历史完成 / 无业务验收记录' : '暂无业务验收记录'
    }}</p>
    <ElTimeline v-else>
      <ElTimelineItem
        v-for="item in project.acceptanceHistory"
        :key="item.id"
        :timestamp="displayTime(item.createdAt)"
      >
        <p
          >{{ actionLabels[item.action] }} · 第 {{ item.round }} 轮 · {{ userName(item.actorId) }} ·
          验收人 {{ userName(item.ownerId) }}</p
        >
        <p class="whitespace-pre-wrap">{{ item.summary || '未填写意见' }}</p>
        <a
          v-if="httpsUrl(item.url)"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-theme"
          >{{ item.url }}</a
        >
      </ElTimelineItem>
    </ElTimeline>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { stageExecutions } from '@/services/stage-execution'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { displayTime } from '@/utils/project-display'
  const props = defineProps<{ projectId: string }>()
  const store = usePrototypeStore()
  const actionLabels = {
    assign: '改派验收人',
    submit: '提交验收',
    withdraw: '撤回验收',
    return: '退回整改',
    accept: '验收通过',
    invalidate: '验收终止'
  }
  const userName = (id: string | null) =>
    store.database?.users.find((u) => u.id === id)?.name ?? '未指定'
  const httpsUrl = (url: string) => {
    try {
      return new URL(url).protocol === 'https:'
    } catch {
      return false
    }
  }
  const project = computed(() => store.visibleProjects.find((p) => p.id === props.projectId))
  const histories = computed(
    () => store.database?.stageHistories.filter((h) => h.projectId === props.projectId) ?? []
  )
  const rows = computed(() =>
    project.value ? stageExecutions(project.value, histories.value) : []
  )
</script>
