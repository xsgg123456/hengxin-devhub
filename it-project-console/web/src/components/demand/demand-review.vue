<template>
  <ElDrawer
    :model-value="true"
    :title="`${demand.parentProjectId ? '优化审批' : '立项审批'} · ${demand.name}`"
    size="760px"
    :before-close="close"
    append-to-body
  >
    <ElAlert v-if="stale" :title="stale" type="warning" :closable="false" class="mb-5" />
    <ElAlert v-if="failure" :title="failure" type="error" :closable="false" class="mb-5" />
    <PrototypeSaveRecovery v-if="failure && runtimeConfig.isPrototype" />
    <p class="mb-2 text-g-500"
      >{{ demand.department }} · {{ demand.parentProjectId ? '期望完成' : '期望上线' }} {{ demand.expectedLaunchDate }}</p
    >
    <p class="mb-5 whitespace-pre-wrap break-all">{{ demand.description }}</p>
    <p v-if="demand.parentProjectId" class="mb-5 whitespace-pre-wrap">期望效果 / 验收标准：{{ demand.optimizationOutcome }}</p>
    <ElTag :type="demand.parentProjectId ? 'warning' : 'primary'" class="mb-3">{{ demand.parentProjectId ? '项目优化' : '正式项目' }}</ElTag><p v-if="demand.parentProjectId" class="mb-4 text-sm">所属原项目：<ElButton link type="primary" @click="router.push({ path: '/project-overview', query: { projectId: demand.parentProjectId! } })">{{ store.visibleProjects.find(p => p.id === demand.parentProjectId)?.name || '查看原项目' }}</ElButton></p><MaterialSummary :demand="demand" />
    <ElDivider />
    <ElForm label-position="top" :disabled="saving">
      <ElFormItem label="处理结果" required>
        <ElRadioGroup v-model="decision">
          <ElRadioButton v-if="!excludeEstablish" value="establish">{{ demand.parentProjectId ? '批准优化' : '批准立项' }}</ElRadioButton>
          <ElRadioButton value="return">退回补充</ElRadioButton>
          <ElRadioButton value="reject">{{ demand.parentProjectId ? '不予通过' : '不予立项' }}</ElRadioButton>
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem v-if="decision !== 'establish'" label="处理原因" required :error="reasonError">
        <ElInput v-model="reason" type="textarea" :rows="4" maxlength="300" show-word-limit />
      </ElFormItem>
    </ElForm>
    <ProjectFields
      :optimization="!!demand.parentProjectId"
      hide-identity
      v-if="decision === 'establish'"
      ref="projectFields"
      v-model="project"
      :disabled="saving"
    />
    <template #footer>
      <ElButton :disabled="saving" @click="close">取消</ElButton>
      <ElButton type="primary" :loading="saving" :disabled="saving || !canApproveProjects(store.currentUser)" @click="save">{{
        decision === 'establish'
          ? '提交工程师确认'
          : decision === 'return'
            ? '确认退回补充'
            : demand.parentProjectId ? '确认不予通过' : '确认不予立项'
      }}</ElButton>
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
  import { canApproveProjects } from '@/utils/project-approver'
  import { runtimeConfig } from '@/config/runtime'
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import type { DemoDemand } from '@/domain/prototype'
  import { reviewDemand, type ProjectInput } from '@/services/workflow-service'
  import { useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { useRecordStaleness } from '@/hooks/business/use-record-staleness'
  import ProjectFields from '@/components/project/project-fields.vue'
  import { ApiError } from '@/services/api-client'
  import { reviewLiveDemand, liveOperationKey } from '@/services/live-demand-service'
  import MaterialSummary from './material-summary.vue'
  const props = defineProps<{ demand: DemoDemand; excludeEstablish?: boolean }>()
  const emit = defineEmits<{ close: []; saved: [] }>()
  const store = usePrototypeStore()
  const router = useRouter()
  const baselineVersion = props.demand.version
  const stale = useRecordStaleness('demand', () => props.demand.id, () => baselineVersion)
  const operationKey = liveOperationKey()
  const decision = ref<'establish' | 'return' | 'reject'>(
    props.excludeEstablish ? 'return' : 'establish'
  )
  const reason = ref('')
  const reasonError = ref('')
  const saving = ref(false)
  const failure = ref('')
  const project = ref<ProjectInput>({
    approvedLaunchDate: props.demand.expectedLaunchDate,
    requestId: crypto.randomUUID(),
    name: props.demand.name,
    department: props.demand.department,
    primaryOwnerId: '',
    collaboratorIds: [],
    priority: 'P1',
    expectedLaunchDate: '',
    expectedDeliveryDate: '',
    stageExpectedDate: ''
  })
  const projectFields = ref<{ validate: () => Promise<boolean> }>()
  const baseline = JSON.stringify(project.value)
  const dirty = computed(
    () =>
      decision.value !== (props.excludeEstablish ? 'return' : 'establish') ||
      !!reason.value ||
      JSON.stringify(project.value) !== baseline
  )
  watch(dirty, (value) => store.setDirty('demand-review', value))
  onBeforeUnmount(() => store.setDirty('demand-review', false))
  async function close() {
    if (saving.value) return
    if (dirty.value) {
      try {
        await ElMessageBox.confirm('评估内容尚未保存，确认放弃？', '放弃评估', {
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑',
          type: 'warning'
        })
      } catch {
        return
      }
    }
    emit('close')
  }
  async function save() {
    if (saving.value) return
    if (stale.value) { failure.value = stale.value; return }
    reasonError.value = ''
    if (decision.value === 'establish') {
      if (!(await projectFields.value?.validate())) return
    } else if (!reason.value.trim()) {
      reasonError.value = '请填写处理原因'
      return
    }
    saving.value = true
    failure.value = ''
    try {
      if (!runtimeConfig.isPrototype) {
        const input = {
          ...project.value,
          requestId: operationKey({
            ...project.value,
            requestId: undefined,
            decision: decision.value,
            reason: reason.value,
            version: baselineVersion
          })
        }
        await store.runLiveCommand(() =>
          reviewLiveDemand(
            props.demand.id,
            baselineVersion,
            decision.value,
            reason.value,
            input
          )
        )
      } else
        await store.runCommand((snapshot) => {
          reviewDemand(snapshot, {
            demandId: props.demand.id,
            decision: decision.value,
            reason: reason.value,
            project: project.value
          })
        })
      store.setDirty('demand-review', false)
      ElMessage.success(
        decision.value === 'establish'
          ? props.demand.parentProjectId ? '优化审批通过，等待主负责工程师接单' : '立项审批通过，等待主负责工程师接单'
          : decision.value === 'return'
            ? '已退回补充，提交人可以重新提交'
            : props.demand.parentProjectId ? '已记录优化不予通过决定及原因' : '已记录不予立项决定及原因'
      )
      emit('saved')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          await store.refreshLive()
        } catch {
          /* 保留原错误及当前输入。 */
        }
      }
      failure.value = cause instanceof Error ? cause.message : '保存失败，输入已保留，请重试'
    } finally {
      saving.value = false
    }
  }
</script>
