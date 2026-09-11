<template>
  <ElDrawer
    :model-value="modelValue"
    :title="adjustment ? '调整项目计划' : '制定项目计划'"
    size="min(760px, 95vw)"
    :before-close="beforeClose"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="project">
      <h3 class="mb-2 text-lg font-medium">{{ project.name }}</h3>
      <p class="mb-5 text-g-600">{{
        project.stage === '方案设计'
          ? '需求受理、立项评审已完成，请安排后续五个环节。'
          : '只安排当前及后续未完成环节，已完成环节保持原记录。'
      }}</p>
      <ElForm :disabled="busy" label-position="top" @submit.prevent="save">
        <ElTable :data="plans" class="mb-6">
          <ElTableColumn prop="stage" label="环节" width="108" />
          <ElTableColumn label="计划开始日期" min-width="205"
            ><template #default="{ row }">
              <ElDatePicker
                v-model="row.startDate"
                type="date"
                value-format="YYYY-MM-DD"
                :aria-label="`${row.stage}计划开始日期`"
              /> </template
          ></ElTableColumn>
          <ElTableColumn label="计划结束日期" min-width="205"
            ><template #default="{ row }">
              <ElDatePicker
                v-model="row.endDate"
                type="date"
                value-format="YYYY-MM-DD"
                :aria-label="`${row.stage}计划结束日期`"
              /> </template
          ></ElTableColumn>
        </ElTable>
        <ElDescriptions :column="2" border>
          <ElDescriptionsItem label="计划上线">{{ milestone('上线部署') }}</ElDescriptionsItem>
          <ElDescriptionsItem label="计划交付">{{ milestone('验收交付') }}</ElDescriptionsItem>
        </ElDescriptions>
        <p class="mt-4 mb-5 text-sm text-g-600">上线和交付日期由对应环节的计划结束日期自动带出。</p>
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
  import { ElMessage } from 'element-plus'
  import {
    SCHEDULE_REASONS,
    type DemoProject,
    type ProjectStage,
    type StagePlan
  } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { useUnsavedForm } from '@/hooks/business/use-unsaved-form'
  import { remainingStages, saveProjectPlan, validatePlans } from '@/services/stage-plan-service'
  import { planLiveProject } from '@/services/live-project-service'
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
  const busy = ref(false),
    initial = ref(''),
    version = ref<number>()
  let operationKey = liveOperationKey()
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
  watch(
    () => props.modelValue,
    (open) => {
      if (!open || !props.project) return
      plans.value = remainingStages(props.project).map((stage) => {
        const old = props.project!.stagePlans?.find((p) => p.stage === stage)
        return { stage, startDate: old?.startDate ?? '', endDate: old?.endDate ?? '' }
      })
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
        version.value = store.visibleProjects.find((p) => p.id === props.project?.id)?.version
        error.value += '；已尝试刷新项目版本，请核对后重试，填写内容已保留'
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
