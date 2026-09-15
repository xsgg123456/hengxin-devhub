<template>
  <ElDrawer
    :model-value="true"
    :title="isOptimization ? '优化需求' : demand ? '编辑本人需求' : '提交正式项目需求'"
    size="760px"
    :before-close="close"
    append-to-body
  >
    <ElAlert
      v-if="demand?.reviewReason"
      :title="`退回原因：${demand.reviewReason}`"
      type="warning"
      :closable="false"
      class="mb-5"
    />
    <ElAlert v-if="failure" :title="failure" type="error" :closable="false" class="mb-5" />
    <PrototypeSaveRecovery v-if="failure && runtimeConfig.isPrototype" />
    <p v-if="isOptimization" class="mb-4 text-sm text-g-600">原项目：{{ store.database?.projects.find(p => p.id === form.parentProjectId)?.name || form.parentProjectId }}</p>
    <ElAlert v-if="stale" :title="stale" type="warning" :closable="false" class="mb-5" />
    <ElForm ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="saving" scroll-to-error>
      <ElFormItem :label="isOptimization ? '优化标题' : '项目名称'" prop="name" :error="errors.name" required>
        <ElInput v-model="form.name" maxlength="100" show-word-limit />
      </ElFormItem>
      <ElRow :gutter="20">
        <ElCol :span="12"
          ><ElFormItem label="需求部门"
            ><ElInput :model-value="store.currentUser.department" readonly /></ElFormItem
        ></ElCol>
        <ElCol :span="12"
          ><ElFormItem label="提出人"
            ><ElInput :model-value="store.currentUser.name" readonly /></ElFormItem
        ></ElCol>
      </ElRow>
      <ElFormItem
        :label="isOptimization ? '当前问题' : '这次要解决什么问题（一句话）'"
        prop="description"
        :error="errors.description"
        required
      >
        <ElInput
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="300"
          show-word-limit
        />
      </ElFormItem>
      <ElFormItem v-if="isOptimization" label="期望效果 / 验收标准" prop="optimizationOutcome" :error="errors.optimizationOutcome" required>
        <ElInput v-model="form.optimizationOutcome" type="textarea" :rows="3" maxlength="300" show-word-limit />
      </ElFormItem>
      <ElFormItem
        label="期望上线日期"
        prop="expectedLaunchDate"
        :error="errors.expectedLaunchDate"
        required
      >
        <ElDatePicker
          v-model="form.expectedLaunchDate"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled-date="pastDate"
        />
      </ElFormItem>
      <ElFormItem label="需求附件" prop="attachments" :error="errors.attachments" :required="!isOptimization">
        <MaterialField
          ref="materialField"
          v-model="form.attachments"
          :disabled="saving"
          :ensure-demand="ensureDraft"
          :optional="isOptimization"
          @busy="uploading = $event"
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <div class="flex justify-end gap-2 flex-wrap">
        <ElButton :disabled="busy" @click="close">取消</ElButton>
        <ElButton :disabled="busy" :loading="saving && !submitting" @click="save(false)">{{
          demand?.status === 'pending' ? '保存修改' : '保存草稿'
        }}</ElButton>
        <ElButton
          type="primary"
          :disabled="busy"
          :loading="saving && submitting"
          @click="save(true)"
          >{{ demand ? '重新提交' : '提交评估' }}</ElButton
        >
      </div>
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
  import { demandCode } from '@/utils/demand-code'
  import { runtimeConfig } from '@/config/runtime'
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
  import type { DemoAttachment, DemoDemand } from '@/domain/prototype'
  import { saveDemand } from '@/services/workflow-service'
  import { validateMaterials } from '@/services/workflow-validation'
  import { demandMaterials } from '@/services/demand-materials'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { currentDate } from '@/utils/project-display'
  import { ApiError } from '@/services/api-client'
  import {
    saveLiveDemand,
    liveOperationKey,
    type LiveDemandInput
  } from '@/services/live-demand-service'
  import MaterialField from './material-field.vue'
  const props = defineProps<{ demand?: DemoDemand; parentProjectId?: string }>()
  const emit = defineEmits<{ close: []; saved: [] }>()
  const store = usePrototypeStore()
  const formRef = ref<FormInstance>()
  const materialField = ref<{ releaseCleanup: () => void }>()
  const form = reactive({
    parentProjectId: props.demand?.parentProjectId ?? props.parentProjectId ?? null,
    optimizationOutcome: props.demand?.optimizationOutcome ?? '',
    name: props.demand?.name || '',
    description: props.demand?.description || '',
    expectedLaunchDate: props.demand?.expectedLaunchDate || '',
    attachments: demandMaterials(props.demand).map(file => ({ ...file }))
  })
  const isOptimization = computed(() => !!form.parentProjectId)
  const rules = computed<FormRules>(() => ({
    name: [{ required: true, whitespace: true, message: isOptimization.value ? '请填写优化标题' : '请填写项目名称', trigger: 'blur' }],
    description: [{ required: true, whitespace: true, message: '请说明要解决的问题', trigger: 'blur' }],
    optimizationOutcome: [{ required: true, whitespace: true, message: '请填写期望效果 / 验收标准', trigger: 'blur' }],
    expectedLaunchDate: [{ required: true, message: '请选择期望上线日期', trigger: 'change' }],
    attachments: [{ type: 'array', required: !isOptimization.value, message: '请上传需求附件', trigger: 'change' }]
  }))
  function input(): LiveDemandInput {
    const legacyLink = (file?: DemoAttachment | null) =>
      file?.kind === 'link' && form.attachments.some(item => item.kind === 'link' && item.url === file.url)
        ? { ...file } : null
    return { ...form, prd: legacyLink(props.demand?.prd), prototype: legacyLink(props.demand?.prototype) }
  }
  const baseline = JSON.stringify(form)
  const dirty = computed(() => JSON.stringify(form) !== baseline)
  const errors = reactive<Record<string, string>>({})
  const saving = ref(false)
  const uploading = ref(false)
  const busy = computed(() => saving.value || uploading.value)
  const liveId = ref(props.demand?.id)
  const liveVersion = ref(props.demand?.version)
  const stale = computed(() => {
    if (runtimeConfig.isPrototype || !liveId.value || saving.value) return ''
    const latest = store.visibleDemands.find(d => d.id === liveId.value)
    return !latest ? '该需求已移除；填写内容已保留，请关闭后核对。'
      : latest.version !== liveVersion.value ? '该需求已被更新；填写内容已保留，请复制需要保留的内容，关闭后重新打开核对。' : ''
  })
  const operationKey = liveOperationKey()
  let draftInput: LiveDemandInput | undefined
  let draftPromise: Promise<string> | undefined
  const submitting = ref(false)
  const failure = ref('')
  const requestId = props.demand?.requestId || crypto.randomUUID()
  watch(dirty, (value) => store.setDirty('demand-form', value))
  onBeforeUnmount(() => store.setDirty('demand-form', false))
  function pastDate(date: Date) {
    // DatePicker supplies a local calendar cell; compare its label to Shanghai's business day.
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return label < currentDate()
  }
  async function ensureDraft(): Promise<string> {
    if (liveId.value) return liveId.value
    if (!draftPromise) {
      draftInput ??= { ...input(), attachments: [], prd: null, prototype: null }
      draftPromise = store
        .runLiveCommand(() => saveLiveDemand(draftInput!, requestId, false))
        .then((result) => {
          liveId.value = result.id
          liveVersion.value = result.version
          return result.id
        })
        .finally(() => {
          draftPromise = undefined
        })
    }
    return draftPromise
  }
  async function close() {
    if (busy.value) return
    if (dirty.value) {
      try {
        await ElMessageBox.confirm('未保存的需求内容将丢失，确认放弃？', '放弃修改', {
          type: 'warning',
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑'
        })
      } catch {
        return
      }
    }
    emit('close')
  }
  async function save(submit: boolean) {
    if (busy.value) return
    if (stale.value) { failure.value = stale.value; return }
    Object.keys(errors).forEach((key) => delete errors[key])
    const requiresMaterials = submit || props.demand?.status === 'pending'
    if (requiresMaterials && !form.name.trim()) errors.name = '请填写项目名称'
    if (requiresMaterials && isOptimization.value && !form.optimizationOutcome.trim()) errors.optimizationOutcome = '请填写期望效果 / 验收标准'
    if (requiresMaterials && !form.description.trim()) errors.description = '请说明要解决的问题'
    if (requiresMaterials && (!form.expectedLaunchDate || form.expectedLaunchDate < currentDate()))
      errors.expectedLaunchDate = '期望上线日期不能早于今天'
    try {
      validateMaterials(form.attachments, !isOptimization.value && requiresMaterials)
    } catch (cause) {
      errors.attachments = cause instanceof Error ? cause.message : '附件校验失败'
    }
    const firstError = Object.keys(errors)[0]
    if (firstError) {
      formRef.value?.scrollToField(firstError)
      return
    }
    saving.value = true
    submitting.value = submit
    failure.value = ''
    try {
      let demandId = ''
      if (!runtimeConfig.isPrototype) {
        await ensureDraft()
        const requestKey = operationKey({
          ...form,
          submit,
          id: liveId.value,
          version: liveVersion.value
        })
        const result = await store.runLiveCommand(() =>
          saveLiveDemand(input(), requestKey, submit, liveId.value, liveVersion.value)
        )
        demandId = result.id
        liveId.value = result.id
        liveVersion.value = result.version
      } else
        await store.runCommand((snapshot) => {
          demandId = saveDemand(snapshot, {
            ...input(),
            attachments: form.attachments.map(file => ({ ...file })),
            id: props.demand?.id,
            requestId,
            submit
          }).id
        })
      store.setDirty('demand-form', false)
      materialField.value?.releaseCleanup()
      const code = demandCode(store.database?.demands.find(demand => demand.id === demandId) ?? {})
      ElMessage.success(
        submit
          ? `${code} 已提交，等待管理人员评估`
          : props.demand?.status === 'pending'
            ? `${code} 修改已保存，仍待评估`
            : `${code} 草稿已保存`
      )
      emit('saved')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          await store.refreshLive()
        } catch {
          /* 当前输入保留，稍后可重试。 */
        }
      }
      failure.value = cause instanceof Error ? cause.message : '保存失败，请重试；输入已保留'
    } finally {
      saving.value = false
    }
  }
</script>
