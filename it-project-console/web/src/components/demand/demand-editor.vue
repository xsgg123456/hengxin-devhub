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
    <PrototypeSaveRecovery v-if="failure" />
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
      <ElFormItem label="PRD 文档（正式提交必填）" prop="prd" :error="errors.prd">
        <MaterialField v-model="form.prd" type="prd" :disabled="saving" />
      </ElFormItem>
      <ElFormItem label="HTML 原型（正式提交必填）" prop="prototype" :error="errors.prototype">
        <MaterialField v-model="form.prototype" type="prototype" :disabled="saving" />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <div class="flex justify-end gap-2 flex-wrap">
        <ElButton :disabled="saving" @click="close">取消</ElButton>
        <ElButton :disabled="saving" :loading="saving && !submitting" @click="save(false)"
          >保存草稿</ElButton
        >
        <ElButton
          type="primary"
          :disabled="saving"
          :loading="saving && submitting"
          @click="save(true)"
          >{{ demand ? '重新提交' : '提交评估' }}</ElButton
        >
      </div>
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
  import type { DemoAttachment, DemoDemand } from '@/domain/prototype'
  import { saveDemand, validateAttachment } from '@/services/workflow-service'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { currentDate } from '@/utils/project-display'
  import MaterialField from './material-field.vue'
  const props = defineProps<{ demand?: DemoDemand }>()
  const emit = defineEmits<{ close: []; saved: [] }>()
  const store = usePrototypeStore()
  const formRef = ref<FormInstance>()
  const form = reactive({
    name: props.demand?.name || '',
    description: props.demand?.description || '',
    expectedLaunchDate: props.demand?.expectedLaunchDate || '',
    prd: (props.demand?.prd ? { ...props.demand.prd } : null) as DemoAttachment | null,
    prototype: (props.demand?.prototype
      ? { ...props.demand.prototype }
      : null) as DemoAttachment | null
  })
  const baseline = JSON.stringify(form)
  const dirty = computed(() => JSON.stringify(form) !== baseline)
  const errors = reactive<Record<string, string>>({})
  const saving = ref(false)
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
  async function close() {
    if (saving.value) return
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
    if (saving.value) return
    Object.keys(errors).forEach((key) => delete errors[key])
    if (submit && !form.name.trim()) errors.name = '请填写项目名称'
    if (submit && !form.description.trim()) errors.description = '请说明要解决的问题'
    if (submit && (!form.expectedLaunchDate || form.expectedLaunchDate < currentDate()))
      errors.expectedLaunchDate = '期望上线日期不能早于今天'
    for (const type of ['prd', 'prototype'] as const) {
      try {
        validateAttachment(form[type], type, submit)
      } catch (cause) {
        errors[type] = cause instanceof Error ? cause.message : '材料校验失败'
      }
    }
    if ((form.prd?.size || 0) + (form.prototype?.size || 0) > 50 * 1024 * 1024)
      errors.prototype = '单需求文件合计不得超过 50 MB'
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
      await store.runCommand((snapshot) => {
        demandId = saveDemand(snapshot, {
          ...form,
          prd: form.prd ? { ...form.prd } : null,
          prototype: form.prototype ? { ...form.prototype } : null,
          id: props.demand?.id,
          requestId,
          submit
        }).id
      })
      store.setDirty('demand-form', false)
      ElMessage.success(submit ? `${demandId} 已提交，等待管理人员评估` : `${demandId} 草稿已保存`)
      emit('saved')
    } catch (cause) {
      failure.value = cause instanceof Error ? cause.message : '保存失败，请重试；输入已保留'
    } finally {
      saving.value = false
    }
  }
</script>
