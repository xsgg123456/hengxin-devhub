<template>
  <ElDrawer
    :model-value="modelValue"
    :title="proposal ? '接单详情 · ' + proposal.name : '直接创建项目'"
    size="min(760px, 95vw)"
    :before-close="beforeClose"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <ElAlert
      class="mb-5"
      :title="
        (proposal?.demandId ? '来源：业务需求。' : '来源：直接创建。') +
        (proposal?.status === 'confirmed'
          ? '已接单并正式立项。'
          : '等待指定主负责工程师接单，接单后正式立项。')
      "
      type="info"
      :closable="false"
    />
    <ElAlert
      v-if="proposal?.reviewReason"
      class="mb-5"
      :title="'工程师退回管理评估：' + proposal.reviewReason"
      type="warning"
      :closable="false"
    />
    <p v-if="demand" class="mb-4 whitespace-pre-wrap"
      >业务期望上线：{{ demand.expectedLaunchDate }}<br />{{ demand.description }}</p
    >
    <MaterialSummary v-if="demand" :demand="demand" />
    <ProjectFields ref="fields" v-model="form" :disabled="busy || (!!proposal && !canReassess)" />
    <ElForm v-if="canConfirm" label-position="top"
      ><ElFormItem label="退回评估原因（退回时必填）"
        ><ElInput v-model="reason" type="textarea" :rows="3" maxlength="300" /></ElFormItem
    ></ElForm>
    <div
      v-if="
        proposal &&
        store.currentUser.role === 'manager' &&
        !proposal.demandId &&
        proposal.status !== 'confirmed'
      "
      class="mt-6 pt-5 border-t"
      ><ElButton type="danger" plain :disabled="busy" @click="remove">删除待接单记录</ElButton></div
    >
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon role="alert" />
    <PrototypeSaveRecovery v-if="error && runtimeConfig.isPrototype" />
    <ElButton v-if="canReassess && demand" class="mt-5" @click="reviewOpen = true"
      >退回业务补充 / 不予立项</ElButton
    >
    <DemandReview
      v-if="reviewOpen && demand"
      :demand="demand"
      exclude-establish
      @close="reviewOpen = false"
      @saved="reviewSaved"
    />
    <LifecycleHistory v-if="proposal" :proposal-id="proposal.id" />
    <template #footer
      ><ElButton :disabled="busy" @click="beforeClose(() => emit('update:modelValue', false))"
        >取消</ElButton
      ><ElButton v-if="canConfirm" :disabled="busy" @click="confirm('return')"
        >退回管理评估</ElButton
      >
      <ElButton v-if="canConfirm" type="primary" :loading="busy" @click="confirm('accept')"
        >确认接单并立项</ElButton
      >
      <ElButton v-if="!proposal || canReassess" type="primary" :loading="busy" @click="save"
        >提交工程师确认</ElButton
      ></template
    >
  </ElDrawer>
</template>
<script setup lang="ts">
  import { runtimeConfig } from '@/config/runtime'
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  import { computed, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { type ProjectInput } from '@/services/workflow-service'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { useUnsavedForm } from '@/hooks/business/use-unsaved-form'
  import { createLiveProject, liveOperationKey } from '@/services/live-demand-service'
  import {
    submitProjectProposal,
    confirmProjectProposal,
    resubmitProjectProposal,
    deleteProjectProposal,
    confirmLiveProposal,
    resubmitLiveProposal,
    deleteLiveProposal
  } from '@/services/proposal-service'
  import { useRouter } from 'vue-router'
  const router = useRouter()
  import ProjectFields from './project-fields.vue'
  import type { ProjectProposal } from '@/domain/prototype'
  import LifecycleHistory from './lifecycle-history.vue'
  import DemandReview from '@/components/demand/demand-review.vue'
  import MaterialSummary from '@/components/demand/material-summary.vue'
  const props = defineProps<{ modelValue: boolean; proposal?: ProjectProposal }>()
  const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [id: string] }>()
  const store = usePrototypeStore()
  const reviewOpen = ref(false)
  function reviewSaved() {
    reviewOpen.value = false
    emit('update:modelValue', false)
  }
  const reason = ref('')
  const canConfirm = computed(
    () =>
      props.proposal?.status === 'pending' && props.proposal.primaryOwnerId === store.currentUser.id
  )
  const canReassess = computed(
    () => props.proposal?.status === 'returned' && store.currentUser.role === 'manager'
  )
  const demand = computed(() => store.visibleDemands.find((d) => d.id === props.proposal?.demandId))
  const emptyForm = (): ProjectInput => ({
    approvedLaunchDate: '',
    requestId: crypto.randomUUID(),
    name: '',
    department: '',
    priority: 'P1',
    primaryOwnerId: '',
    collaboratorIds: [],
    expectedLaunchDate: '',
    expectedDeliveryDate: '',
    stageExpectedDate: ''
  })
  let operationKey = liveOperationKey()
  const form = ref<ProjectInput>(emptyForm())
  const initial = ref('')
  const busy = ref(false)
  const error = ref('')
  const fields = ref<{ validate: () => Promise<boolean> }>()
  const dirty = computed(
    () => props.modelValue && (JSON.stringify(form.value) !== initial.value || !!reason.value)
  )
  const { beforeClose } = useUnsavedForm('project-create', dirty, busy)
  watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        operationKey = liveOperationKey()
        form.value = props.proposal
          ? { ...props.proposal, collaboratorIds: [...props.proposal.collaboratorIds] }
          : emptyForm()
        reason.value = ''
        initial.value = JSON.stringify(form.value)
        error.value = ''
      }
    },
    { immediate: true }
  )
  async function save(): Promise<void> {
    if (busy.value || !(await fields.value?.validate())) return
    busy.value = true
    error.value = ''
    try {
      let id = ''
      const input = JSON.parse(JSON.stringify(form.value)) as ProjectInput
      if (!runtimeConfig.isPrototype) {
        input.requestId = operationKey({ ...input, requestId: undefined })
        id = (
          await store.runLiveCommand(() =>
            props.proposal
              ? resubmitLiveProposal(props.proposal.id, props.proposal.version, input)
              : createLiveProject(input)
          )
        ).id
      } else
        await store.runCommand((draft) => {
          id = (
            props.proposal
              ? resubmitProjectProposal(draft, props.proposal.id, props.proposal.version, input)
              : submitProjectProposal(draft, input)
          ).id
        })
      initial.value = JSON.stringify(form.value)
      emit('update:modelValue', false)
      void router.push({ path: '/today-tasks', query: { proposalId: id } })
      ElMessage.success('已提交，等待主负责工程师接单')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '创建失败，请重试'
    } finally {
      busy.value = false
    }
  }
  async function confirm(decision: 'accept' | 'return') {
    if (!props.proposal || busy.value) return
    if (decision === 'return' && !reason.value.trim()) {
      error.value = '请填写退回评估原因'
      return
    }
    const proposal = props.proposal
    busy.value = true
    error.value = ''
    try {
      let projectId: string | null | undefined
      if (runtimeConfig.isPrototype)
        await store.runCommand((draft) => {
          projectId = confirmProjectProposal(
            draft,
            proposal.id,
            proposal.version,
            decision,
            reason.value
          ).projectId
        })
      else
        projectId = (
          await store.runLiveCommand(() =>
            confirmLiveProposal(
              proposal.id,
              proposal.version,
              decision,
              reason.value,
              operationKey({
                id: proposal.id,
                version: proposal.version,
                decision,
                reason: reason.value
              })
            )
          )
        ).projectId
      reason.value = ''
      initial.value = JSON.stringify(form.value)
      emit('update:modelValue', false)
      ElMessage.success(
        decision === 'accept' ? '已接单并正式立项，请制定计划' : '已退回管理人员重新评估'
      )
      if (projectId) void router.push({ path: '/project-overview', query: { projectId } })
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '操作失败，请重试'
    } finally {
      busy.value = false
    }
  }
  async function remove() {
    const proposal = props.proposal
    if (!proposal || busy.value) return
    try {
      await ElMessageBox.confirm(
        '删除后无法恢复，确认删除“' + proposal.name + '”？',
        '删除待接单记录',
        { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    busy.value = true
    error.value = ''
    try {
      if (runtimeConfig.isPrototype)
        await store.runCommand((draft) =>
          deleteProjectProposal(draft, proposal.id, proposal.version)
        )
      else
        await store.runLiveCommand(() =>
          deleteLiveProposal(
            proposal.id,
            proposal.version,
            operationKey({ id: proposal.id, version: proposal.version, action: 'delete' })
          )
        )
      emit('update:modelValue', false)
      ElMessage.success('已删除待接单记录')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '删除失败'
    } finally {
      busy.value = false
    }
  }
</script>
