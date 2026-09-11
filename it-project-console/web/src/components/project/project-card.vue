<template>
  <article
    class="project-card"
    :class="{ alert: severe, attention: risks.length && !severe }"
    :data-project-id="project.id"
  >
    <div class="card-heading"
      ><h3>{{ project.name }}</h3
      ><ElTag size="small" :type="project.priority === 'P0' ? 'danger' : 'info'">{{
        project.priority
      }}</ElTag></div
    >
    <p class="project-id">{{ project.id }}</p>
    <div class="tags"
      ><ElTag size="small">{{
        project.status === 'active'
          ? needsPlan(project)
            ? '待排期'
            : statusLabel[project.simpleStatus]
          : project.status === 'completed'
            ? '项目已完成'
            : '已取消'
      }}</ElTag
      ><ElTag size="small" type="info">{{ project.stage }}</ElTag
      ><ElTag v-if="relationship" size="small" type="info">{{ relationship }}</ElTag></div
    >
    <dl>
      <div
        ><dt>需求部门</dt><dd>{{ project.department }}</dd></div
      >
      <div
        ><dt>提出人</dt><dd>{{ demand ? userName(demand.submitterId) : '直接创建' }}</dd></div
      >
      <div
        ><dt>主负责人</dt><dd>{{ userName(project.primaryOwnerId) }}</dd></div
      >
      <div
        ><dt>协作人员</dt
        ><dd>{{ project.collaboratorIds.map(userName).join('、') || '无' }}</dd></div
      >
      <div
        ><dt>预计上线</dt><dd>{{ project.expectedLaunchDate || '—' }}</dd></div
      >
      <div
        ><dt>预计交付</dt><dd>{{ project.expectedDeliveryDate || '—' }}</dd></div
      >
      <div
        ><dt>原计划上线</dt><dd>{{ project.originalLaunchDate || '—' }}</dd></div
      >
      <div
        ><dt>原计划交付</dt><dd>{{ project.originalDeliveryDate || '—' }}</dd></div
      >
      <div class="full"
        ><dt>最近整体更新</dt><dd>{{ displayTime(project.lastOverallUpdatedAt) }}</dd></div
      >
    </dl>
    <RiskTag :risks="risks" />
    <StageProgress class="mt-3" :stage="project.stage" :status="project.simpleStatus" />
    <div class="actions"
      ><ElButton
        v-if="canUpdate && (!isOverall || !needsPlan(project))"
        type="primary"
        @click="$emit('update', project.id)"
        >{{ isOverall ? '更新环节' : '填写协作进展' }}</ElButton
      ><ElButton
        v-if="canUpdate && isOverall"
        :type="needsPlan(project) ? 'primary' : 'default'"
        @click="planOpen = true"
        >{{ needsPlan(project) ? '制定计划' : '调整计划' }}</ElButton
      ><ElButton @click="$emit('detail', project.id)">详情</ElButton></div
    >
    <p class="relation-note">{{
      canUpdate
        ? isOverall
          ? '可更新整体进度与计划'
          : '仅填写个人进展，不改变整体进度'
        : '当前项目仅可查看'
    }}</p>
    <ProjectPlanDrawer v-model="planOpen" :project="project" />
  </article>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { DemoProject } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { computeProjectRisks } from '@/services/risk-service'
  import { displayTime, statusLabel } from '@/utils/project-display'
  import ProjectPlanDrawer from './project-plan-drawer.vue'
  import { needsPlan } from '@/services/stage-plan-service'
  const planOpen = ref(false)
  import StageProgress from './stage-progress.vue'
  import RiskTag from './risk-tag.vue'
  const props = defineProps<{ project: DemoProject }>()
  defineEmits<{ detail: [id: string]; update: [id: string] }>()
  const store = usePrototypeStore()
  const userName = (id: string) =>
    store.database?.users.find((u) => u.id === id)?.name ?? '未知人员'
  const demand = computed(() =>
    store.database?.demands.find((d) => d.id === props.project.demandId)
  )
  const isOverall = computed(
    () =>
      store.currentUser.role === 'manager' || store.currentUser.id === props.project.primaryOwnerId
  )
  const relationship = computed(() =>
    store.currentUser.id === props.project.primaryOwnerId
      ? '主责'
      : props.project.collaboratorIds.includes(store.currentUser.id)
        ? '协作'
        : ''
  )
  const canUpdate = computed(
    () =>
      props.project.status === 'active' &&
      !props.project.archived &&
      (isOverall.value || relationship.value === '协作')
  )
  const risks = computed(() =>
    props.project.riskVersion !== undefined
      ? props.project.risks
      : computeProjectRisks(props.project, store.database?.scheduleChanges ?? [])
  )
  const severe = computed(() => risks.value.some((risk) => /延期|未更新/.test(risk)))
</script>
<style scoped>
  .project-card {
    min-width: 0;
    padding: 18px;
    border: 1px solid var(--art-card-border);
    border-radius: 12px;
    background: var(--default-box-color);
  }
  .attention {
    border-top: 3px solid #ffbf65;
  }
  .alert {
    border-top: 3px solid #ff8790;
  }
  .card-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
  }
  h3 {
    font-size: 15px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .project-id,
  .relation-note {
    font-size: 12px;
    color: var(--art-gray-600);
    margin: 5px 0 10px;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
    margin: 14px 0;
    font-size: 12px;
  }
  dl div {
    min-width: 0;
  }
  dt {
    color: var(--art-gray-600);
  }
  dd {
    overflow-wrap: anywhere;
    margin: 2px 0 0;
  }
  .full {
    grid-column: 1 / -1;
  }
  .progress-label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin: 14px 0 8px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .actions .el-button {
    flex: 1;
    margin: 0;
    padding: 8px;
  }
  .relation-note {
    margin: 10px 0 0;
  }
</style>
