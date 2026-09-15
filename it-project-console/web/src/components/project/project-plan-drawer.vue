<template>
  <ElDrawer
    :model-value="modelValue"
    :title="adjustment ? '调整项目计划' : '制定项目计划'"
    size="min(760px, 95vw)"
    :before-close="beforeClose"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert v-if="stale" :title="stale" type="warning" :closable="false" class="mb-4" />
    <template v-if="project">
      <h3 class="mb-2 text-lg font-medium">{{ project.name }}</h3>
      <p class="mb-5 text-g-600">{{
        project.parentProjectId ? '只安排优化交付的开始和交付日期，完成后提交业务验收。' : project.stage === '方案设计'
          ? '需求受理、立项评审已完成，请安排后续五个环节。'
          : '只安排当前及后续未完成环节，已完成环节保持原记录。'
      }}</p>
      <p v-if="defaultNotice" class="mb-5 text-sm text-g-600">{{ defaultNotice }}</p>
      <ElForm :disabled="busy" label-position="top" @submit.prevent="save">
        <ElTable :data="plans" class="mb-6">
          <ElTableColumn label="环节" width="108"><template #default="{ row }">{{ project.parentProjectId ? '优化交付' : row.stage }}</template></ElTableColumn>
          <ElTableColumn label="计划开始日期" min-width="205"
            ><template #default="{ row }">
              <ElDatePicker
                v-model="row.startDate"
                type="date"
                value-format="YYYY-MM-DD"
                :aria-label="`${project.parentProjectId ? '优化交付' : row.stage}计划开始日期`"
              /> </template
          ></ElTableColumn>
          <ElTableColumn label="计划结束日期" min-width="205"
            ><template #default="{ row }">
              <ElDatePicker
                v-model="row.endDate"
                type="date"
                value-format="YYYY-MM-DD"
                :aria-label="`${project.parentProjectId ? '优化交付' : row.stage}计划结束日期`"
              /> </template
          ></ElTableColumn>
        </ElTable>
        <ElDescriptions :column="2" border>
          <ElDescriptionsItem label="审批确认上线日期" :span="2">{{
            project.approvedLaunchDate || '未设置'
          }}</ElDescriptionsItem>
          <ElDescriptionsItem v-if="!project.parentProjectId" label="计划上线">{{ milestone('上线部署') }}</ElDescriptionsItem>
          <ElDescriptionsItem label="计划交付">{{ milestone('验收交付') }}</ElDescriptionsItem>
        </ElDescriptions>
        <ElAlert
          v-if="overrun > 0"
          class="mt-4"
          type="warning"
          :closable="false"
          :title="`超出审批日期 ${overrun} 天`"
          description="可继续保存计划，无需管理人员再次确认；审批确认日期保留作为对照基准。"
        />
        <p class="mt-4 mb-5 text-sm text-g-600">{{ project.parentProjectId ? '计划交付日期由优化交付节点的结束日期带出。' : '上线和交付日期由对应环节的计划结束日期自动带出。' }}</p>
        <template v-if="changed">
          <ElFormItem label="日期调整原因" required>
            <ElSelect v-model="reason" aria-label="日期调整原因"
              ><ElOption
                v-for="value in SCHEDULE_REASONS"
                :key="value"
                :value="value"
                :label="value"
            /></ElSelect>
          </ElFormItem>
          <ElFormItem label="日期调整说明" required
            ><ElInput
              v-model="description"
              aria-label="日期调整说明"
              type="textarea"
              maxlength="300"
              show-word-limit
          /></ElFormItem>
        </template>
      </ElForm>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" role="alert" />
      <PrototypeSaveRecovery v-if="error" />
    </template>
    <template #footer>
      <ElButton :disabled="busy" @click="beforeClose(() => emit('update:modelValue', false))"
        >取消</ElButton
      >
      <ElButton type="primary" :loading="busy" @click="save">保存计划</ElButton>
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { approvedLaunchOverrun } from '@/utils/approved-launch'
  import { ElMessage } from 'element-plus'
  import {
    SCHEDULE_REASONS,
    type DemoProject,
    type ProjectStage,
    type StagePlan
  } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { useUnsavedForm } from '@/hooks/business/use-unsaved-form'
  import { useRecordStaleness } from '@/hooks/business/use-record-staleness'
  import { saveProjectPlan, validatePlans } from '@/services/stage-plan-service'
  import { planLiveProject } from '@/services/live-project-service'
  import { defaultStagePlans } from '@/services/default-stage-plans'
  import { liveOperationKey } from '@/services/live-demand-service'
  import { ApiError } from '@/services/api-client'
  import { runtimeConfig } from '@/config/runtime'
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  const props = defineProps<{ modelValue: boolean; project: DemoProject | null }>()
  const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
  const store = usePrototypeStore()
  const plans = ref<StagePlan[]>([]),
    reason = ref(''),
    description = ref(''),
    error = ref('')
  const defaultNotice = ref('')
  const busy = ref(false),
    initial = ref(''),
    version = ref<number>()
  let operationKey = liveOperationKey()
  const stale = useRecordStaleness('project', () => props.project?.id, () => version.value)
  const snapshot = () =>
    JSON.stringify({ plans: plans.value, reason: reason.value, description: description.value })
  const dirty = computed(() => props.modelValue && snapshot() !== initial.value)
  const { beforeClose } = useUnsavedForm('project-plan', dirty, busy)
  const adjustment = computed(() => Boolean(props.project?.stagePlans?.length))
  const changed = computed(() =>
    plans.value.some((plan) => {
      const old = props.project?.stagePlans?.find((p) => p.stage === plan.stage)
      return old && (old.startDate !== plan.startDate || old.endDate !== plan.endDate)
    })
  )
  const milestone = (stage: ProjectStage) =>
    plans.value.find((p) => p.stage === stage)?.endDate ||
    props.project?.stagePlans?.find((p) => p.stage === stage)?.endDate ||
    '—'
  const overrun = computed(() =>
    approvedLaunchOverrun(props.project?.approvedLaunchDate, milestone(props.project?.parentProjectId ? '验收交付' : '上线部署'))
  )
  watch(
    () => props.modelValue,
    (open) => {
      if (!open || !props.project) return
      const defaults = defaultStagePlans(props.project, store.database?.stageHistories ?? [])
      plans.value = defaults.plans
      defaultNotice.value = defaults.notice
      version.value = props.project.version
      reason.value = ''
      description.value = ''
      error.value = ''
      operationKey = liveOperationKey()
      initial.value = snapshot()
    }
  )
  async function save() {
    if (busy.value || !props.project) return
    if (stale.value) { error.value = stale.value; return }
    busy.value = true
    error.value = ''
    try {
      const input = {
        projectId: props.project.id,
        plans: plans.value,
        changeReason: reason.value || undefined,
        changeDescription: description.value || undefined
      }
      validatePlans(props.project, input)
      if (runtimeConfig.isPrototype)
        await store.runCommand((draft) => {
          saveProjectPlan(draft, input)
        })
      else
        await store.runLiveCommand(() =>
          planLiveProject(input, version.value, operationKey({ input, version: version.value }))
        )
      initial.value = snapshot()
      emit('update:modelValue', false)
      ElMessage.success('项目计划已保存')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '保存失败，请重试'
      if (cause instanceof ApiError && cause.status === 409) {
        await store.refreshLive().catch(() => undefined)
        error.value += '；填写内容已保留，请关闭后重新打开核对'
      }
    } finally {
      busy.value = false
    }
  }
</script>
<style scoped>
  :deep(.el-date-editor),
  :deep(.el-select) {
    width: 100%;
  }
</style>



