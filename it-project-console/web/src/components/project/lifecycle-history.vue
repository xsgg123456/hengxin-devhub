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
  import { projectCode } from '@/utils/project-code'
  import { computed } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { displayTime } from '@/utils/project-display'
  import type { DemoLifecycleEvent } from '@/domain/prototype'
  const props = defineProps<{ projectId?: string; proposalId?: string }>()
  const store = usePrototypeStore()
  const actions: Record<DemoLifecycleEvent['action'], string> = {
    submit: '提交工程师确认',
    accept: '工程师接单',
    return: '退回管理评估',
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
    projectId: '关联项目',
    name: '名称',
    department: '部门',
    reviewReason: '退回原因',
    primaryOwnerId: '主负责人',
    collaboratorIds: '协作人员',
    priority: '优先级',
    approvedLaunchDate: '审批确认上线日期',
    version: '版本',
    stagePlans: '环节计划',
    status: '状态',
    archived: '归档',
    stage: '阶段',
    simpleStatus: '阶段状态',
    actualCompletedAt: '实际完成时间',
    deleted: '已删除'
  }
  const values: Record<string, string> = {
    pending: '待工程师确认',
    returned: '退回管理评估',
    confirmed: '已接单立项',
    PENDING: '待工程师确认',
    RETURNED: '退回管理评估',
    CONFIRMED: '已接单立项',
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
  function displayValue(key: string, value: string | number | boolean) {
    if (key === 'primaryOwnerId' || key === 'collaboratorIds')
      return (
        String(value)
          .split(',')
          .filter(Boolean)
          .map((id) => store.database?.users.find((u) => u.id === id)?.name ?? '未知人员')
          .join('、') || '无'
      )
    if (key === 'projectId') {
      const project = store.visibleProjects.find((p) => p.id === value)
      return project ? projectCode(project) : value ? '关联项目已删除' : '未立项'
    }
    return values[String(value)] ?? (value === '' ? '—' : value)
  }
  function describe(data: DemoLifecycleEvent['before']) {
    return Object.entries(data)
      .filter(([key]) => key !== 'overallProgress')
      .map(([key, value]) => `${labels[key] ?? key}：${displayValue(key, value)}`)
      .join(' · ')
  }
  const events = computed(
    () =>
      store.database?.lifecycleEvents
        .filter(
          (e) =>
            (e.entityType === 'project' && e.entityId === props.projectId) ||
            (e.entityType === 'proposal' &&
              (e.entityId === props.proposalId ||
                store.database?.projectProposals?.some(
                  (p) => p.id === e.entityId && p.projectId === props.projectId
                )))
        )
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
