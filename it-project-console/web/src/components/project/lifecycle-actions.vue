<template>
  <section class="mt-6">
    <h4 class="font-medium mb-3">项目状态与管理</h4>
    <p class="text-sm mb-3">{{ stateLabel }}{{ project.archived ? ' · 已归档' : '' }}</p>
    <div class="actions">
      <ElButton
        v-if="canComplete"
        type="success"
        :disabled="store.saving || confirming"
        @click="act('complete')"
        >完成并归档</ElButton
      >
      <template v-if="manager">
        <ElButton
          v-if="active"
          :disabled="store.saving || confirming"
          @click="correctionOpen = true"
          >管理纠正</ElButton
        >
        <ElButton
          v-if="!project.archived"
          :disabled="store.saving || confirming"
          @click="act('archive')"
          >归档项目</ElButton
        >
        <ElButton v-if="!active" :disabled="store.saving || confirming" @click="act('reopen')"
          >重新打开</ElButton
        >
      </template>
    </div>
    <div v-if="manager && (active || canDelete)" class="danger-actions">
      <ElButton
        v-if="active"
        type="danger"
        plain
        :disabled="store.saving || confirming"
        @click="act('cancel')"
        >取消项目</ElButton
      >
      <ElButton
        v-if="canDelete"
        type="danger"
        plain
        :disabled="store.saving || confirming"
        @click="act('delete')"
        >删除误建项目</ElButton
      >
    </div>
    <ElAlert v-if="error" class="mt-3" type="error" :title="error" :closable="false" />
    <ProgressUpdateDrawer v-model="correctionOpen" :project="project" correction />
  </section>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { runtimeConfig } from '@/config/runtime'
  import { ApiError } from '@/services/api-client'
  import { liveOperationKey } from '@/services/live-demand-service'
  import { actionLiveProject } from '@/services/live-project-service'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import type { DemoProject } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { actionProject } from '@/services/lifecycle-service'
  import ProgressUpdateDrawer from './progress-update-drawer.vue'
  const props = defineProps<{ project: DemoProject }>()
  const store = usePrototypeStore()
  let operationKey = liveOperationKey()
  const reasons = new Map<string, string>()
  const confirming = ref(false)
  const error = ref(''),
    correctionOpen = ref(false)
  const manager = computed(() => store.currentUser.role === 'manager')
  const active = computed(() => props.project.status === 'active' && !props.project.archived)
  const stateLabel = computed(
    () => ({ active: '进行中', completed: '已完成', cancelled: '已取消' })[props.project.status]
  )
  const canComplete = computed(
    () =>
      active.value &&
      props.project.primaryOwnerId === store.currentUser.id &&
      props.project.stage === '验收交付' &&
      props.project.simpleStatus === 'completed'
  )
  const canDelete = computed(
    () => !store.database?.progressUpdates.some((p) => p.projectId === props.project.id)
  )
  const labels = {
    complete: '完成并归档',
    cancel: '取消项目',
    archive: '归档项目',
    reopen: '重新打开',
    delete: '删除误建项目'
  }
  async function act(action: keyof typeof labels) {
    if (store.saving || confirming.value) return
    confirming.value = true
    const target = props.project
    error.value = ''
    let reason = reasons.get(action) ?? ''
    try {
      if (action === 'cancel' || action === 'delete') {
        const result = await ElMessageBox.prompt(
          `项目「${target.name}」：` +
            (action === 'delete'
              ? '删除不可恢复；关联需求将回到待评估。请填写误建原因。'
              : '取消后保留全部历史和材料。请填写原因。'),
          labels[action],
          {
            inputType: 'textarea',
            inputValue: reason,
            inputValidator: (v) =>
              (Boolean(v?.trim()) && v.trim().length <= 300) || '请填写 1～300 字原因',
            confirmButtonText: '确认' + labels[action],
            cancelButtonText: '保留项目',
            type: 'warning'
          }
        )
        reason = result.value
        reasons.set(action, reason)
      } else
        await ElMessageBox.confirm(
          `项目「${target.name}」：` +
            (action === 'reopen'
              ? '恢复为进行中，保留全部历史。'
              : '归档后从默认活跃列表移除，可在含归档范围中查看。'),
          labels[action],
          {
            confirmButtonText: '确认' + labels[action],
            cancelButtonText: '暂不操作',
            type: 'warning'
          }
        )
    } catch {
      confirming.value = false
      return
    }
    confirming.value = false
    try {
      const input = { projectId: target.id, action, reason }
      const version = target.version
      if (!runtimeConfig.isPrototype)
        await store.runLiveCommand(() =>
          actionLiveProject(input, version, operationKey({ input, version }))
        )
      else
        await store.runCommand((draft) => {
          actionProject(draft, input)
        })
      operationKey = liveOperationKey()
      reasons.delete(action)
      ElMessage.success(labels[action] + '成功')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '保存失败，请重试'
      if (cause instanceof ApiError && cause.status === 409) {
        await store.refreshLive().catch(() => undefined)
        error.value += '；已尝试刷新项目，请核对后重试'
      }
    }
  }
</script>
<style scoped>
  .actions,
  .danger-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .actions :deep(.el-button),
  .danger-actions :deep(.el-button) {
    margin-left: 0;
  }
  .danger-actions {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--art-card-border);
  }
</style>
