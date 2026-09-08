<template>
  <ElDrawer
    :model-value="true"
    :title="`需求评估 · ${demand.name}`"
    size="760px"
    :before-close="close"
    append-to-body
  >
    <ElAlert v-if="failure" :title="failure" type="error" :closable="false" class="mb-5" />
    <PrototypeSaveRecovery v-if="failure" />
    <p class="mb-2 text-g-500"
      >{{ demand.department }} · 期望上线 {{ demand.expectedLaunchDate }}</p
    >
    <p class="mb-5 whitespace-pre-wrap break-all">{{ demand.description }}</p>
    <MaterialSummary :demand="demand" />
    <ElDivider />
    <ElForm label-position="top" :disabled="saving">
      <ElFormItem label="处理结果" required>
        <ElRadioGroup v-model="decision">
          <ElRadioButton value="establish">立项</ElRadioButton>
          <ElRadioButton value="return">退回补充</ElRadioButton>
          <ElRadioButton value="reject">不予立项</ElRadioButton>
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem v-if="decision !== 'establish'" label="处理原因" required :error="reasonError">
        <ElInput v-model="reason" type="textarea" :rows="4" maxlength="300" show-word-limit />
      </ElFormItem>
    </ElForm>
    <ProjectFields
      hide-identity
      v-if="decision === 'establish'"
      ref="projectFields"
      v-model="project"
      :disabled="saving"
    />
    <template #footer>
      <ElButton :disabled="saving" @click="close">取消</ElButton>
      <ElButton type="primary" :loading="saving" :disabled="saving" @click="save">{{
        decision === 'establish'
          ? '通过并立项'
          : decision === 'return'
            ? '确认退回补充'
            : '确认不予立项'
      }}</ElButton>
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import type { DemoDemand } from '@/domain/prototype'
  import { reviewDemand, type ProjectInput } from '@/services/workflow-service'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import ProjectFields from '@/components/project/project-fields.vue'
  import MaterialSummary from './material-summary.vue'
  const props = defineProps<{ demand: DemoDemand }>()
  const emit = defineEmits<{ close: []; saved: [] }>()
  const store = usePrototypeStore()
  const decision = ref<'establish' | 'return' | 'reject'>('establish')
  const reason = ref('')
  const reasonError = ref('')
  const saving = ref(false)
  const failure = ref('')
  const project = ref<ProjectInput>({
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
      decision.value !== 'establish' || !!reason.value || JSON.stringify(project.value) !== baseline
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
          ? '已立项，项目进入方案设计'
          : decision.value === 'return'
            ? '已退回补充，提交人可以重新提交'
            : '已记录不予立项决定及原因'
      )
      emit('saved')
    } catch (cause) {
      failure.value = cause instanceof Error ? cause.message : '保存失败，输入已保留，请重试'
    } finally {
      saving.value = false
    }
  }
</script>
