<template>
  <ElForm ref="formRef" :model="model" :rules="rules" label-position="top" :disabled="disabled">
    <ElFormItem v-if="!hideIdentity" label="项目名称" prop="name">
      <ElInput v-model="model.name" maxlength="100" show-word-limit />
    </ElFormItem>
    <ElFormItem v-if="!hideIdentity" label="需求部门" prop="department">
      <ElInput v-model="model.department" maxlength="100" />
    </ElFormItem>
    <ElFormItem label="项目优先级" prop="priority">
      <ElRadioGroup v-model="model.priority"
        ><ElRadioButton v-for="p in ['P0', 'P1', 'P2']" :key="p" :value="p">{{
          p
        }}</ElRadioButton></ElRadioGroup
      >
    </ElFormItem>
    <ElFormItem label="主负责人" prop="primaryOwnerId">
      <ElSelect
        v-model="model.primaryOwnerId"
        aria-label="主负责人"
        placeholder="选择一名 IT 工程师"
        @change="removeOwnerFromCollaborators"
      >
        <ElOption v-for="user in engineers" :key="user.id" :label="user.name" :value="user.id" />
      </ElSelect>
    </ElFormItem>
    <ElFormItem label="协作人员" prop="collaboratorIds">
      <ElSelect
        v-model="model.collaboratorIds"
        multiple
        aria-label="协作人员"
        placeholder="可选多人，与主负责人互斥"
      >
        <ElOption
          v-for="user in engineers"
          :key="user.id"
          :label="user.name"
          :value="user.id"
          :disabled="user.id === model.primaryOwnerId"
        />
      </ElSelect>
    </ElFormItem>
    <div class="dates">
      <ElFormItem label="最初计划上线日期" prop="expectedLaunchDate"
        ><ElDatePicker
          v-model="model.expectedLaunchDate"
          type="date"
          value-format="YYYY-MM-DD"
          aria-label="最初计划上线日期"
      /></ElFormItem>
      <ElFormItem label="最初计划交付日期" prop="expectedDeliveryDate"
        ><ElDatePicker
          v-model="model.expectedDeliveryDate"
          type="date"
          value-format="YYYY-MM-DD"
          aria-label="最初计划交付日期"
      /></ElFormItem>
    </div>
    <ElFormItem label="方案设计预计完成日期" prop="stageExpectedDate"
      ><ElDatePicker
        v-model="model.stageExpectedDate"
        type="date"
        value-format="YYYY-MM-DD"
        aria-label="方案设计预计完成日期"
    /></ElFormItem>
  </ElForm>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import type { ProjectInput } from '@/services/workflow-service'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const model = defineModel<ProjectInput>({ required: true })
  defineProps<{ hideIdentity?: boolean; disabled?: boolean }>()
  const store = usePrototypeStore()
  const engineers = computed(
    () => store.database?.users.filter((user) => user.department === '信息技术部') ?? []
  )
  const formRef = ref<FormInstance>()
  const rules: FormRules = Object.fromEntries(
    [
      'name',
      'department',
      'primaryOwnerId',
      'priority',
      'expectedLaunchDate',
      'expectedDeliveryDate',
      'stageExpectedDate'
    ].map((field) => [field, [{ required: true, message: '请填写此项', trigger: 'change' }]])
  )
  function removeOwnerFromCollaborators(): void {
    model.value.collaboratorIds = model.value.collaboratorIds.filter(
      (id) => id !== model.value.primaryOwnerId
    )
  }
  async function validate(): Promise<boolean> {
    return (await formRef.value?.validate().catch(() => false)) ?? false
  }
  defineExpose({ validate })
</script>

<style scoped>
  .dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  :deep(.el-date-editor),
  :deep(.el-select) {
    width: 100%;
  }
</style>
