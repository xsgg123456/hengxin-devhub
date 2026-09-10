<template>
  <ElDrawer
    :model-value="true"
    :title="demand ? '编辑本人需求' : '提交正式项目需求'"
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
    <ElForm ref="formRef" :model="form" label-position="top" :disabled="saving" scroll-to-error>
      <ElFormItem label="项目名称" prop="name" :error="errors.name" required>
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
        label="这次要解决什么问题（一句话）"
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
      <ElFormItem label="需求附件" prop="attachments" :error="errors.attachments" required>
        <MaterialField
          ref="materialField"
          v-model="form.attachments"
          :disabled="saving"
          :ensure-demand="ensureDraft"
          @busy="uploading = $event"
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <div class="flex justify-end gap-2 flex-wrap">
        <ElButton :disabled="busy" @click="close">取消</ElButton>
        <ElButton :disabled="busy" :loading="saving && !submitting" @click="save(false)">{{
          !runtimeConfig.isPrototype && demand?.status === 'pending' ? '保存修改' : '保存草稿'
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
  import { runtimeConfig } from '@/config/runtime'
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
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
  const props = defineProps<{ demand?: DemoDemand }>()
  const emit = defineEmits<{ close: []; saved: [] }>()
  const store = usePrototypeStore()
  const formRef = ref<FormInstance>()
  const materialField = ref<{ releaseCleanup: () => void }>()
  const form = reactive({
    name: props.demand?.name || '',
    description: props.demand?.description || '',
    expectedLaunchDate: props.demand?.expectedLaunchDate || '',
    attachments: demandMaterials(props.demand).map(file => ({ ...file }))
  })
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
    Object.keys(errors).forEach((key) => delete errors[key])
    if (submit && !form.name.trim()) errors.name = '请填写项目名称'
    if (submit && !form.description.trim()) errors.description = '请说明要解决的问题'
    if (submit && (!form.expectedLaunchDate || form.expectedLaunchDate < currentDate()))
      errors.expectedLaunchDate = '期望上线日期不能早于今天'
    try {
      validateMaterials(form.attachments, submit || props.demand?.status === 'pending')
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
      ElMessage.success(
        submit
          ? `${demandId} 已提交，等待管理人员评估`
          : !runtimeConfig.isPrototype && props.demand?.status === 'pending'
            ? `${demandId} 修改已保存，仍待评估`
            : `${demandId} 草稿已保存`
      )
      emit('saved')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          await store.refreshLive()
          liveVersion.value =
            store.database?.demands.find((demand) => demand.id === liveId.value)?.version ??
            liveVersion.value
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
