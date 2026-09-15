<template>
  <ElDialog :model-value="modelValue" title="登记历史已交付" width="min(560px, 92vw)" append-to-body :close-on-click-modal="false" :show-close="!store.saving" :close-on-press-escape="!store.saving" @update:model-value="emit('update:modelValue', $event)">
    <p class="mb-4">登记项目实际已交付的历史事实，项目将标记为已完成，并保留为“历史完成 / 无业务验收记录”。</p>
    <ElForm label-position="top" :disabled="store.saving">
      <ElFormItem label="实际交付日期" required><ElDatePicker v-model="deliveredOn" aria-label="实际交付日期" type="date" value-format="YYYY-MM-DD" placeholder="选择实际交付日期" /></ElFormItem>
      <ElFormItem label="补录原因" required><ElInput v-model="reason" aria-label="补录原因" type="textarea" :rows="3" maxlength="300" placeholder="说明历史交付事实及补录依据" /></ElFormItem>
    </ElForm>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <template #footer><ElButton :disabled="store.saving" @click="emit('update:modelValue', false)">取消</ElButton><ElButton type="primary" :loading="store.saving" @click="save">确认登记</ElButton></template>
  </ElDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { DemoProject } from '@/domain/prototype'
import { runtimeConfig } from '@/config/runtime'
import { usePrototypeStore } from '@/store/modules/prototype'
import { liveOperationKey } from '@/services/live-demand-service'
import { registerHistoricalDelivery, registerLiveHistoricalDelivery } from '@/services/historical-delivery-service'
import { dateValue, textValue } from '@/services/workflow-validation'
const props = defineProps<{ modelValue: boolean; project: DemoProject; dirty: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; completed: [] }>()
const store = usePrototypeStore()
const deliveredOn = ref(''), reason = ref(''), error = ref(''), version = ref(0)
let operationKey = liveOperationKey()
watch([deliveredOn, reason], () => { error.value = '' })
watch(() => props.modelValue, open => {
  if (!open) return
  deliveredOn.value = ''; reason.value = ''; error.value = ''
  version.value = props.project.version ?? 0
  operationKey = liveOperationKey()
})
async function save() {
  if (store.saving) return
  error.value = ''
  try {
    if (props.dirty) throw new Error('有未保存的修改，请先保存或放弃修改，再登记历史交付')
    dateValue(deliveredOn.value, '实际交付日期')
    const payload = { projectId: props.project.id, version: version.value, deliveredOn: deliveredOn.value, reason: textValue(reason.value, '补录原因') }
    if (!runtimeConfig.isPrototype && !Number.isInteger(props.project.version)) throw new Error('项目版本缺失，请关闭后刷新重试')
    const input = { ...payload, requestId: operationKey(payload) }
    if (runtimeConfig.isPrototype) await store.runCommand(draft => registerHistoricalDelivery(draft, input))
    else await store.runLiveCommand(() => registerLiveHistoricalDelivery(input))
    emit('update:modelValue', false)
    emit('completed')
    ElMessage.success('历史交付已登记，项目已完成')
  } catch (e) { error.value = e instanceof Error ? e.message : '登记失败，请重试' }
}
</script>
