<template>
  <ElDrawer
    :model-value="modelValue"
    :title="correction ? '管理纠正' : overall ? '更新项目进度' : '填写协作进展'"
    size="min(760px, 95vw)"
    :before-close="beforeClose"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="project">
      <h3 class="mb-2 text-lg font-medium">{{ project.name }}</h3>
      <p class="mb-5 text-g-600">{{
        overall ? '维护项目整体进度与计划' : '只记录自己的进展与阻塞，不修改项目整体进度'
      }}</p>
      <ElForm
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        :disabled="busy"
        @submit.prevent="save"
      >
        <template v-if="overall">
          <ElFormItem label="整体进度（%）" prop="overallProgress"
            ><ElInputNumber
              v-model="form.overallProgress"
              :min="0"
              :max="100"
              :precision="0"
              aria-label="整体进度（%）"
            /><span class="ml-3 text-xs text-g-600">100% 不自动完成项目</span></ElFormItem
          >
          <ElFormItem label="当前阶段"
            ><ElSelect v-if="correction" v-model="correctionStage" aria-label="纠正阶段"
              ><ElOption
                v-for="stage in correctionStages"
                :key="stage"
                :label="stage"
                :value="stage" /></ElSelect
            ><ElInput v-else :model-value="project.stage" readonly
          /></ElFormItem>
          <ElFormItem label="当前阶段状态" prop="status"
            ><ElSelect v-model="form.status" aria-label="当前阶段状态"
              ><ElOption
                v-for="(label, value) in statusLabel"
                :key="value"
                :label="label"
                :value="value" /></ElSelect
          ></ElFormItem>
          <ElAlert
            v-if="nextStage"
            class="mb-5"
            :title="`保存后进入${nextStage}，请设置新阶段预计完成日期。`"
            type="info"
            :closable="false"
          />
          <ElFormItem v-if="nextStage" label="下一阶段预计完成日期" prop="nextStageExpectedDate"
            ><ElDatePicker
              v-model="form.nextStageExpectedDate"
              type="date"
              value-format="YYYY-MM-DD"
              aria-label="下一阶段预计完成日期"
          /></ElFormItem>
          <ElFormItem label="当前阶段预计完成日期" prop="stageExpectedDate"
            ><ElDatePicker
              v-model="form.stageExpectedDate"
              type="date"
              value-format="YYYY-MM-DD"
              aria-label="当前阶段预计完成日期"
          /></ElFormItem>
          <div class="date-fields">
            <ElFormItem label="当前预计上线日期" prop="expectedLaunchDate"
              ><ElDatePicker
                v-model="form.expectedLaunchDate"
                type="date"
                value-format="YYYY-MM-DD"
                aria-label="当前预计上线日期"
            /></ElFormItem>
            <ElFormItem label="当前预计交付日期" prop="expectedDeliveryDate"
              ><ElDatePicker
                v-model="form.expectedDeliveryDate"
                type="date"
                value-format="YYYY-MM-DD"
                aria-label="当前预计交付日期"
            /></ElFormItem>
          </div>
          <template v-if="datesChanged">
            <ElFormItem label="日期调整原因" prop="changeReason"
              ><ElSelect v-model="form.changeReason" aria-label="日期调整原因"
                ><ElOption
                  v-for="reason in SCHEDULE_REASONS"
                  :key="reason"
                  :label="reason"
                  :value="reason" /></ElSelect
            ></ElFormItem>
            <ElFormItem label="日期调整说明" prop="changeDescription"
              ><ElInput
                v-model="form.changeDescription"
                type="textarea"
                maxlength="300"
                show-word-limit
            /></ElFormItem>
          </template>
        </template>
        <ElFormItem :label="correction ? '纠正原因' : '进展说明'" prop="summary"
          ><ElInput
            v-model="form.summary"
            type="textarea"
            :rows="3"
            maxlength="300"
            show-word-limit
            placeholder="一句话说明已完成什么、下一步是什么"
        /></ElFormItem>
        <ElFormItem v-if="!overall" label="是否遇到阻塞"
          ><ElSwitch v-model="blocked" aria-label="是否遇到阻塞"
        /></ElFormItem>
        <ElFormItem v-if="blocked || form.status === 'blocked'" label="阻塞说明" prop="blocker"
          ><ElInput v-model="form.blocker" type="textarea" maxlength="300" show-word-limit
        /></ElFormItem>
      </ElForm>
      <ElAlert v-if="error" type="error" :title="error" :closable="false" show-icon role="alert" />
      <PrototypeSaveRecovery v-if="error" />
    </template>
    <template #footer>
      <p v-if="overall" class="mb-3 text-xs text-g-600"
        >本次保存：{{ project?.stage }} · {{ statusLabel[form.status ?? 'in-progress'] }} · 整体
        {{ form.overallProgress }}%{{ datesChanged ? ' · 包含日期调整' : '' }}</p
      >
      <ElButton :disabled="busy" @click="beforeClose(() => emit('update:modelValue', false))"
        >取消</ElButton
      >
      <ElButton type="primary" :loading="busy" @click="save">{{
        correction ? '保存纠正' : '保存进度'
      }}</ElButton>
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  import { computed, ref, watch } from 'vue'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import {
    PROJECT_STAGES,
    SCHEDULE_REASONS,
    type DemoProject,
    type ProjectStage
  } from '@/domain/prototype'
  import { updateProgress, type ProgressInput } from '@/services/workflow-service'
  import { correctProject } from '@/services/management-service'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { useUnsavedForm } from '@/hooks/business/use-unsaved-form'
  import { statusLabel } from '@/utils/project-display'
  const props = defineProps<{
    modelValue: boolean
    project: DemoProject | null
    correction?: boolean
  }>()
  const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
  const store = usePrototypeStore()
  const overall = computed(
    () =>
      store.currentUser.role === 'manager' || store.currentUser.id === props.project?.primaryOwnerId
  )
  const form = ref<ProgressInput>({ projectId: '', kind: 'overall', summary: '' })
  const correctionStage = ref<ProjectStage>('方案设计')
  const correctionStages = computed(() =>
    PROJECT_STAGES.filter(
      (s) =>
        s === props.project?.stage ||
        store.database?.stageHistories.some(
          (h) => h.projectId === props.project?.id && h.stage === s
        )
    )
  )
  const initial = ref('')
  const blocked = ref(false)
  const busy = ref(false)
  const error = ref('')
  const formRef = ref<FormInstance>()
  const formSnapshot = () =>
    JSON.stringify({
      form: form.value,
      blocked: blocked.value,
      correctionStage: correctionStage.value
    })
  const dirty = computed(() => props.modelValue && formSnapshot() !== initial.value)
  const { beforeClose } = useUnsavedForm('project-progress', dirty, busy)
  const nextStage = computed(() =>
    !props.correction && overall.value && form.value.status === 'completed' && props.project
      ? PROJECT_STAGES[PROJECT_STAGES.indexOf(props.project.stage) + 1]
      : undefined
  )
  const datesChanged = computed(
    () =>
      overall.value &&
      props.project &&
      (['stageExpectedDate', 'expectedLaunchDate', 'expectedDeliveryDate'] as const).some(
        (field) => props.project![field] !== form.value[field]
      )
  )
  const required = { required: true, message: '请填写此项', trigger: 'change' }
  const rules = computed<FormRules>(() => ({
    summary: [required, { whitespace: true, message: '请填写进展说明', trigger: 'blur' }],
    ...(overall.value
      ? {
          overallProgress: [required],
          status: [required],
          stageExpectedDate: [required],
          expectedLaunchDate: [required],
          expectedDeliveryDate: [required]
        }
      : {}),
    ...(nextStage.value ? { nextStageExpectedDate: [required] } : {}),
    ...(datesChanged.value ? { changeReason: [required], changeDescription: [required] } : {}),
    ...(blocked.value || form.value.status === 'blocked' ? { blocker: [required] } : {})
  }))
  watch(
    () => props.modelValue,
    (open) => {
      if (!open || !props.project) return
      const p = props.project
      correctionStage.value = p.stage
      blocked.value = false
      form.value = {
        projectId: p.id,
        kind: overall.value ? 'overall' : 'personal',
        summary: '',
        blocker: overall.value ? p.blocker : '',
        ...(overall.value
          ? {
              overallProgress: p.overallProgress,
              status: p.simpleStatus,
              stageExpectedDate: p.stageExpectedDate,
              expectedLaunchDate: p.expectedLaunchDate,
              expectedDeliveryDate: p.expectedDeliveryDate
            }
          : {})
      }
      initial.value = formSnapshot()
      error.value = ''
    }
  )
  async function save(): Promise<void> {
    if (busy.value || !(await formRef.value?.validate().catch(() => false))) return
    busy.value = true
    error.value = ''
    try {
      const input: ProgressInput = overall.value
        ? { ...form.value }
        : {
            projectId: form.value.projectId,
            kind: 'personal',
            summary: form.value.summary,
            status: blocked.value ? 'blocked' : 'in-progress',
            blocker: blocked.value ? form.value.blocker : ''
          }
      await store.runCommand((draft) => {
        if (props.correction)
          correctProject(draft, {
            ...input,
            stage: correctionStage.value,
            overallProgress: input.overallProgress ?? 0,
            reason: input.summary
          })
        else updateProgress(draft, input)
      })
      initial.value = formSnapshot()
      emit('update:modelValue', false)
      ElMessage.success(
        props.correction
          ? '管理纠正已保存'
          : overall.value
            ? '项目整体进度已更新'
            : '个人进展已保存'
      )
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '保存失败，请重试'
    } finally {
      busy.value = false
    }
  }
</script>
<style scoped>
  .date-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  :deep(.el-date-editor),
  :deep(.el-select) {
    width: 100%;
  }
</style>
