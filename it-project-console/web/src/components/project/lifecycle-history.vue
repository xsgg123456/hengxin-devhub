<template>
  <section class="mt-6"
    ><h4 class="font-medium mb-4">状态与管理历史</h4>
    <p v-if="!events.length" class="text-sm text-g-600">暂无状态与管理操作</p>
    <div v-for="event in events" :key="event.id" class="history-row">
      <p>{{ actions[event.action] }} · {{ event.reason || '—' }}</p>
      <p v-if="event.before || event.after" class="mt-1"
        >{{ describe(event.before) }} → {{ describe(event.after) }}</p
      >
      <small
        >{{ store.database?.users.find((u) => u.id === event.authorId)?.name ?? event.authorId }} ·
        {{ displayTime(event.createdAt) }}</small
      >
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { displayTime } from '@/utils/project-display'
  import type { DemoLifecycleEvent } from '@/domain/prototype'
  const props = defineProps<{ projectId: string }>()
  const store = usePrototypeStore()
  const actions: Record<DemoLifecycleEvent['action'], string> = {
    plan: '保存项目计划',
    complete: '完成项目',
    cancel: '取消项目',
    archive: '归档项目',
    reopen: '重新打开',
    delete: '删除',
    withdraw: '撤回',
    correct: '管理纠正',
    grant: '添加管理权限',
    revoke: '移除管理权限'
  }
  const labels: Record<string, string> = {
    stagePlans: '环节计划',
    status: '状态',
    archived: '归档',
    stage: '阶段',
    simpleStatus: '阶段状态',
    actualCompletedAt: '实际完成时间',
    deleted: '已删除'
  }
  const values: Record<string, string> = {
    active: '进行中',
    completed: '已完成',
    cancelled: '已取消',
    'in-progress': '进行中',
    'not-started': '未开始',
    'nearly-done': '即将完成',
    blocked: '已阻塞',
    true: '是',
    false: '否'
  }
  function describe(data: DemoLifecycleEvent['before']) {
    return Object.entries(data)
      .filter(([key]) => key !== 'overallProgress')
      .map(
        ([key, value]) =>
          `${labels[key] ?? key}：${values[String(value)] ?? value}${key === 'overallProgress' ? '%' : ''}`
      )
      .join(' · ')
  }
  const events = computed(
    () =>
      store.database?.lifecycleEvents
        .filter((e) => e.entityType === 'project' && e.entityId === props.projectId)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? []
  )
</script>
<style scoped>
  .history-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--art-card-border);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  small {
    color: var(--art-gray-600);
  }
</style>
