<template>
  <section class="mt-6"
    ><h4 class="font-medium mb-4">状态与管理历史</h4>
    <p v-if="!events.length" class="text-sm text-g-600">暂无状态与管理操作</p>
    <div v-for="event in events" :key="event.id" class="history-row">
      <p>{{ actionLabel(event) }} · {{ event.reason || '—' }}</p>
      <p v-if="event.before || event.after" class="mt-1"
        >{{ describe(event.before, event.after, event.entityType) }} → {{ describe(event.after, event.before, event.entityType) }}</p
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
  const props = defineProps<{ projectId?: string; proposalId?: string; demandId?: string }>()
  const store = usePrototypeStore()
  const actions: Record<DemoLifecycleEvent['action'], string> = {
    submit: '提交工程师确认',
    resubmit: '重新提交需求',
    reject: '不予立项',
    edit: '编辑资料',
    verify: '完成迁移核实',
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
    firstRequestedOn: '需求首次提出日期',
    businessOwnerId: '业务负责人',
    acceptanceOwnerId: '业务验收人',
    migrationVerified: '迁移已核实',
    expectedLaunchDate: '预计上线',
    expectedDeliveryDate: '预计交付',
    originalLaunchDate: '原计划上线',
    originalDeliveryDate: '原计划交付',
    description: '项目描述',
    acceptanceUrl: '交付链接',
    acceptanceSummary: '交付说明',
    blocker: '阻塞说明',
    submittedAt: '提交时间',
    submitterId: '提出人',
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
  function displayValue(key: string, value: unknown, entityType: string) {
    if (entityType === 'demand' && key === 'status') {
      const statuses: Record<string, string> = { DRAFT: '草稿', PENDING: '待评估', RETURNED: '退回补充', REJECTED: '不予立项', WITHDRAWN: '已撤回', ESTABLISHED: '已立项', AWAITING_ENGINEER: '待工程师确认' }
      return statuses[String(value).toUpperCase()] ?? value
    }
    if (['primaryOwnerId', 'collaboratorIds', 'businessOwnerId', 'acceptanceOwnerId', 'submitterId'].includes(key))
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
    if (key === 'stagePlans' && Array.isArray(value)) return value.map(plan => `${plan.stage}：${plan.startDate || '—'} 至 ${plan.endDate || '—'}`).join('；') || '未填写'
    return values[String(value)] ?? (value === '' || value == null ? '未填写' : value)
  }
  function actionLabel(event: DemoLifecycleEvent) {
    if (event.entityType === 'demand' && event.action === 'submit') return '提交需求'
    if (event.entityType === 'demand' && event.action === 'return') return '退回补充'
    return actions[event.action] ?? event.action
  }
  function fields(data: DemoLifecycleEvent['before']): Record<string, unknown> {
    if (typeof data?.details === 'string') {
      try { return JSON.parse(data.details) as Record<string, unknown> } catch { return data }
    }
    return data ?? {}
  }
  function describe(data: DemoLifecycleEvent['before'], other: DemoLifecycleEvent['before'], entityType: string) {
    const previous = fields(other)
    return Object.entries(fields(data))
      .filter(([key, value]) => labels[key] && JSON.stringify(value) !== JSON.stringify(previous[key]))
      .map(([key, value]) => `${labels[key]}：${displayValue(key, value, entityType)}`)
      .join(' · ') || '无字段变更'
  }
  const events = computed(
    () =>
      store.database?.lifecycleEvents
        .filter(
          (e) =>
            (e.entityType === 'demand' && e.entityId === props.demandId) ||
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
