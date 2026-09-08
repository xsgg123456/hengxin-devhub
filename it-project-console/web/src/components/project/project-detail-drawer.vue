<template>
  <ElDrawer
    :model-value="modelValue"
    title="项目详情"
    size="min(760px, 95vw)"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <ElEmpty v-if="!project" description="项目不存在或已移除" />
    <template v-else>
      <div class="flex-cb gap-3 mb-3"
        ><h3 class="text-lg font-medium">{{ project.name }}</h3
        ><ElTag>{{ project.priority }}</ElTag></div
      >
      <p class="mb-4 text-xs text-g-600"
        >{{ project.id }} · {{ project.source === 'direct' ? '直接创建' : '需求立项' }}</p
      >
      <RiskTag :risks="risks" />
      <ElDescriptions class="mt-5 mb-5" :column="2" border>
        <ElDescriptionsItem label="需求部门">{{ project.department }}</ElDescriptionsItem>
        <ElDescriptionsItem label="提出人">{{
          demand ? userName(demand.submitterId) : '直接创建'
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="主负责人">{{
          userName(project.primaryOwnerId)
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="协作人员">{{
          project.collaboratorIds.map(userName).join('、') || '无'
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="整体进度">{{ project.overallProgress }}%</ElDescriptionsItem>
        <ElDescriptionsItem label="阶段状态">{{
          statusLabel[project.simpleStatus]
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="原计划上线">{{ project.originalLaunchDate }}</ElDescriptionsItem>
        <ElDescriptionsItem label="当前预计上线">{{
          project.expectedLaunchDate
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="原计划交付">{{
          project.originalDeliveryDate
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="当前预计交付">{{
          project.expectedDeliveryDate
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="阶段预计完成">{{
          project.stageExpectedDate
        }}</ElDescriptionsItem>
        <ElDescriptionsItem label="最近整体更新">{{
          displayTime(project.lastOverallUpdatedAt)
        }}</ElDescriptionsItem>
      </ElDescriptions>
      <StageProgress :stage="project.stage" :status="project.simpleStatus" />
      <StageHistory :project-id="project.id" />
      <LifecycleActions :project="project" />
      <LifecycleHistory :project-id="project.id" />
      <h4 class="mt-6 mb-4 font-medium">更新记录</h4>
      <ElEmpty v-if="!updates.length" description="暂无进度记录，等待首次更新" :image-size="50" />
      <ElTimeline v-else
        ><ElTimelineItem
          v-for="update in updates"
          :key="update.id"
          :timestamp="displayTime(update.createdAt)"
          ><p
            >{{ userName(update.authorId) }} ·
            {{ update.kind === 'overall' ? '整体更新' : '个人进展' }} · {{ update.stage }} ·
            {{ statusLabel[update.status] }}</p
          ><p class="mt-1 whitespace-pre-wrap">{{ update.summary }}</p
          ><p v-if="update.blocker" class="text-danger mt-1"
            >阻塞：{{ update.blocker }}</p
          ></ElTimelineItem
        ></ElTimeline
      >
      <h4 class="mt-6 mb-4 font-medium">日期调整记录</h4>
      <p v-if="!changes.length" class="text-sm text-g-600">暂无日期调整</p>
      <div v-for="change in changes" :key="change.id" class="history-row"
        ><p>{{ fieldLabels[change.field] }}：{{ change.oldValue }} → {{ change.newValue }}</p
        ><p>{{ change.reason }} · {{ change.description }}</p
        ><small>{{ userName(change.authorId) }} · {{ displayTime(change.createdAt) }}</small></div
      >
      <h4 class="mt-6 mb-4 font-medium">需求材料</h4>
      <p v-if="!demand" class="text-sm text-g-600">直接创建项目，无关联需求材料</p>
      <template v-else
        ><p class="mb-3 whitespace-pre-wrap">{{ demand.description }}</p
        ><div v-for="item in materials" :key="item.label" class="material"
          ><span>{{ item.label }}</span
          ><a
            v-if="safeLink(item.value)"
            :href="item.value!.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ item.value!.url }}</a
          ><span v-else>{{
            item.value ? `${item.value.name}（模拟上传，仅保存文件信息）` : '未提供'
          }}</span></div
        ></template
      >
    </template>
    <template #footer
      ><ElButton @click="$emit('update:modelValue', false)">关闭</ElButton
      ><ElButton v-if="canUpdate" type="primary" @click="$emit('edit', project!.id)">{{
        isOverall ? '更新进度' : '填写协作进展'
      }}</ElButton></template
    >
  </ElDrawer>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import type { DemoAttachment, DemoProject } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { computeProjectRisks } from '@/services/risk-service'
  import { displayTime, statusLabel } from '@/utils/project-display'
  import StageProgress from './stage-progress.vue'
  import StageHistory from './stage-history.vue'
  import RiskTag from './risk-tag.vue'
  import LifecycleActions from './lifecycle-actions.vue'
  import LifecycleHistory from './lifecycle-history.vue'
  const props = defineProps<{ modelValue: boolean; project: DemoProject | null }>()
  defineEmits<{ 'update:modelValue': [value: boolean]; edit: [id: string] }>()
  const store = usePrototypeStore()
  const userName = (id: string) =>
    store.database?.users.find((u) => u.id === id)?.name ?? '未知人员'
  const demand = computed(() =>
    store.database?.demands.find((d) => d.id === props.project?.demandId)
  )
  const materials = computed(() => [
    { label: 'PRD 文档', value: demand.value?.prd },
    { label: 'HTML 原型', value: demand.value?.prototype }
  ])
  const updates = computed(
    () =>
      store.database?.progressUpdates
        .filter((u) => u.projectId === props.project?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? []
  )
  const changes = computed(
    () =>
      store.database?.scheduleChanges
        .filter((c) => c.projectId === props.project?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? []
  )
  const risks = computed(() =>
    props.project ? computeProjectRisks(props.project, store.database?.scheduleChanges ?? []) : []
  )
  const fieldLabels = {
    stageExpectedDate: '阶段预计完成',
    expectedLaunchDate: '预计上线',
    expectedDeliveryDate: '预计交付'
  }
  const isOverall = computed(
    () =>
      store.currentUser.role === 'manager' || store.currentUser.id === props.project?.primaryOwnerId
  )
  const canUpdate = computed(
    () =>
      props.project?.status === 'active' &&
      !props.project.archived &&
      (isOverall.value || props.project.collaboratorIds.includes(store.currentUser.id))
  )
  function safeLink(value: DemoAttachment | null | undefined): boolean {
    try {
      return value?.kind === 'link' && new URL(value.url ?? '').protocol === 'https:'
    } catch {
      return false
    }
  }
</script>
<style scoped>
  .history-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--art-card-border);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .history-row small {
    color: var(--art-gray-600);
  }
  .material {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .material a {
    color: var(--el-color-primary);
  }
  :deep(.el-descriptions__content) {
    overflow-wrap: anywhere;
  }
</style>
