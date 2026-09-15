<template>
  <ElDrawer
    :model-value="modelValue"
    :title="
      correction ? '管理纠正' : acceptanceMode ? (project?.parentProjectId ? '优化完成验收' : '业务验收') : overall ? (project?.parentProjectId ? '更新优化进度' : '更新环节') : '填写协作进展'
    "
    size="min(760px, 95vw)"
    :before-close="closeDrawer"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ElAlert v-if="stale" :title="stale" type="warning" :closable="false" class="mb-4" />
    <template v-if="project">
      <h3 class="mb-2 text-lg font-medium">{{ project.name }}</h3>
      <p class="mb-5 text-g-600">{{
        acceptanceMode
          ? '主负责人提交交付，指定业务负责人确认验收结果'
          : overall
            ? project.parentProjectId ? '按既定计划更新优化进度，完成后提交业务验收' : '按既定计划更新当前环节的完成情况'
            : '只记录自己的进展与阻塞，不修改项目整体进度'
      }}</p>
      <AcceptancePanel
        v-if="acceptanceMode && modelValue"
        ref="acceptancePanel"
        :project="currentProject!"
      />
      <ElForm
        v-else
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        :disabled="busy"
        @submit.prevent="save"
      >
        <template v-if="overall">
          <ElFormItem label="当前阶段"
            ><ElSelect v-if="correction" v-model="correctionStage" aria-label="纠正阶段"
              ><ElOption
                v-for="stage in (project.parentProjectId ? ['验收交付'] : correctionStages)"
                :key="stage"
                :label="project.parentProjectId ? '优化完成验收' : stage"
                :value="stage" /></ElSelect
            ><ElInput v-else :model-value="project.parentProjectId ? '优化完成验收' : project.stage" readonly
          /></ElFormItem>
          <ElFormItem v-if="!correction" label="计划区间">
            <p>{{
              currentPlan ? `${currentPlan.startDate} → ${currentPlan.endDate}` : '尚未制定计划'
            }}</p>
          </ElFormItem>
          <ElFormItem label="当前环节是否完成" prop="status">
            <ElRadioGroup v-model="form.status" aria-label="当前环节是否完成">
              <ElRadioButton value="in-progress">尚未完成</ElRadioButton>
              <ElRadioButton v-if="!correction && project.stage !== '验收交付'" value="completed"
                >已完成</ElRadioButton
              >
            </ElRadioGroup>
          </ElFormItem>
          <ElAlert
            v-if="!correction && unplanned"
            class="mb-5"
            :title="project.parentProjectId ? '请先制定优化完成验收计划，再更新完成情况。' : '请先制定当前及后续环节计划，再更新完成情况。'"
            type="warning"
            :closable="false"
          />
          <ElAlert
            v-else-if="!correction && form.status === 'completed'"
            class="mb-5"
            :title="
              nextStage
                ? `保存后记录实际完成时间，并进入${nextStage}。`
                : '请提交业务验收，通过后记录实际完成时间。'
            "
            type="info"
            :closable="false"
          />
        </template>
        <ElFormItem
          :label="correction ? '纠正原因' : overall ? '补充说明（选填）' : '进展说明'"
          prop="summary"
          ><ElInput
            v-model="form.summary"
            type="textarea"
            :rows="3"
            maxlength="300"
            show-word-limit
            placeholder="一句话说明已完成什么、下一步是什么"
        /></ElFormItem>
        <ElFormItem v-if="!overall" label="是否遇到阻塞"
          ><ElSwitch v-model="blocked" aria-label="是否遇到阻塞"
        /></ElFormItem>
        <ElFormItem v-if="blocked || form.status === 'blocked'" label="阻塞说明" prop="blocker"
          ><ElInput v-model="form.blocker" type="textarea" maxlength="300" show-word-limit
        /></ElFormItem>
      </ElForm>
      <ElAlert v-if="error" type="error" :title="error" :closable="false" show-icon role="alert" />
      <ElButton v-if="overall && !correction && unplanned" class="mt-4" @click="planOpen = true"
        >制定计划</ElButton
      >
      <PrototypeSaveRecovery v-if="error" />
      <ProjectPlanDrawer v-model="planOpen" :project="project" />
    </template>
    <template #footer>
      <ElButton :disabled="busy" @click="closeDrawer(() => emit('update:modelValue', false))"
        >取消</ElButton
      >
      <ElButton
        v-if="!acceptanceMode"
        type="primary"
        :loading="busy"
        :disabled="overall && !correction && unplanned"
        @click="save"
        >{{ correction ? '保存纠正' : '保存更新' }}</ElButton
      >
    </template>
  </ElDrawer>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import AcceptancePanel from './acceptance-panel.vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import ProjectPlanDrawer from './project-plan-drawer.vue'
  const planOpen = ref(false)
  import PrototypeSaveRecovery from '@/components/system/prototype-save-recovery.vue'
  import type { DemoProject } from '@/domain/prototype'
  import { useProgressForm } from '@/hooks/business/use-progress-form'
  const props = defineProps<{
    modelValue: boolean
    project: DemoProject | null
    correction?: boolean
  }>()
  const store = usePrototypeStore()
  const acceptancePanel = ref<InstanceType<typeof AcceptancePanel> | null>(null)
  const closeDrawer = (done: () => void) =>
    acceptanceMode.value && acceptancePanel.value
      ? acceptancePanel.value.beforeClose(done)
      : beforeClose(done)
  const currentProject = computed(
    () => store.visibleProjects.find((p) => p.id === props.project?.id) ?? props.project
  )
  const acceptanceMode = ref(false)
  const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
  const {
    stale,
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
    unplanned,
    currentPlan,
    rules,
    save
  } = useProgressForm(props, emit)
  watch(() => props.modelValue, open => {
    if (open) acceptanceMode.value = !props.correction && currentProject.value?.stage === '验收交付' && overall.value
  })
</script>
<style scoped>
  .date-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  :deep(.el-date-editor),
  :deep(.el-select) {
    width: 100%;
  }
</style>
