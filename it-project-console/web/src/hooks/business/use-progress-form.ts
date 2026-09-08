import { runtimeConfig } from '@/config/runtime'
import { ApiError } from '@/services/api-client'
import { liveOperationKey } from '@/services/live-demand-service'
import {
  correctLiveProject,
  updateLiveProgress,
  toCorrectionInput
} from '@/services/live-project-service'
import { computed, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { PROJECT_STAGES, type DemoProject, type ProjectStage } from '@/domain/prototype'
import { updateProgress, type ProgressInput } from '@/services/workflow-service'
import { correctProject } from '@/services/management-service'
import { usePrototypeStore } from '@/store/modules/prototype'
import { useUnsavedForm } from '@/hooks/business/use-unsaved-form'
export function useProgressForm(
  props: { modelValue: boolean; project: DemoProject | null; correction?: boolean },
  emit: (event: 'update:modelValue', value: boolean) => void
) {
  const store = usePrototypeStore()
  let operationKey = liveOperationKey()
  const version = ref<number>()
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
      operationKey = liveOperationKey()
      version.value = p.version
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
      if (!runtimeConfig.isPrototype) {
        const correction = toCorrectionInput(input, correctionStage.value)
        const payload = props.correction ? correction : input
        const requestId = operationKey({ payload, version: version.value })
        await store.runLiveCommand(() =>
          props.correction
            ? correctLiveProject(correction, version.value, requestId)
            : updateLiveProgress(input, version.value, requestId)
        )
      } else
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
      if (cause instanceof ApiError && cause.status === 409) {
        await store.refreshLive().catch(() => undefined)
        version.value = store.visibleProjects.find((p) => p.id === form.value.projectId)?.version
        error.value += '；已尝试刷新项目版本，请核对后重试，填写内容已保留'
      }
    } finally {
      busy.value = false
    }
  }
  return {
    overall,
    form,
    correctionStage,
    correctionStages,
    blocked,
    busy,
    error,
    formRef,
    beforeClose,
    nextStage,
    datesChanged,
    rules,
    save
  }
}
