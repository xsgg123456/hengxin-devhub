<template>
  <ElDrawer
    :model-value="modelValue"
    title="直接创建项目"
    size="min(760px, 95vw)"
    :before-close="beforeClose"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <ElAlert
      class="mb-5"
      title="来源：直接创建。保存后进入方案设计，由指定主负责人维护进度。"
      type="info"
      :closable="false"
    />
    <ProjectFields ref="fields" v-model="form" :disabled="busy" />
    <ElAlert v-if="error" :title="error" type="error" :closable="false" show-icon role="alert" />
    <template #footer
      ><ElButton :disabled="busy" @click="beforeClose(() => emit('update:modelValue', false))"
        >取消</ElButton
      ><ElButton type="primary" :loading="busy" @click="save">创建项目</ElButton></template
    >
  </ElDrawer>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { createProject, type ProjectInput } from '@/services/workflow-service'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { useUnsavedForm } from '@/hooks/business/use-unsaved-form'
  import ProjectFields from './project-fields.vue'
  const props = defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [id: string] }>()
  const store = usePrototypeStore()
  const emptyForm = (): ProjectInput => ({
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
  const form = ref<ProjectInput>(emptyForm())
  const initial = ref('')
  const busy = ref(false)
  const error = ref('')
  const fields = ref<{ validate: () => Promise<boolean> }>()
  const dirty = computed(() => props.modelValue && JSON.stringify(form.value) !== initial.value)
  const { beforeClose } = useUnsavedForm('project-create', dirty, busy)
  watch(
    () => props.modelValue,
    (open) => {
      if (open) {
        form.value = emptyForm()
        initial.value = JSON.stringify(form.value)
        error.value = ''
      }
    }
  )
  async function save(): Promise<void> {
    if (busy.value || !(await fields.value?.validate())) return
    busy.value = true
    error.value = ''
    try {
      let id = ''
      const input = JSON.parse(JSON.stringify(form.value)) as ProjectInput
      await store.runCommand((draft) => {
        id = createProject(draft, input).id
      })
      initial.value = JSON.stringify(form.value)
      emit('update:modelValue', false)
      emit('created', id)
      ElMessage.success('项目已创建')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '创建失败，请重试'
    } finally {
      busy.value = false
    }
  }
</script>
