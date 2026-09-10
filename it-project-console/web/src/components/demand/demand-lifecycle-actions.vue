<template>
  <ElDropdown v-if="deletable || withdrawable" trigger="click" @command="act">
    <ElButton link type="danger" :disabled="store.saving || confirming" aria-label="更多需求操作"
      >更多</ElButton
    >
    <template #dropdown
      ><ElDropdownMenu
        ><ElDropdownItem v-if="withdrawable" command="withdraw">撤回需求</ElDropdownItem
        ><ElDropdownItem v-if="deletable" command="delete">删除需求</ElDropdownItem></ElDropdownMenu
      ></template
    >
  </ElDropdown>
</template>
<script setup lang="ts">
  import { runtimeConfig } from '@/config/runtime'
  import { actionLiveDemand } from '@/services/live-demand-service'
  import { computed, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import type { DemoDemand } from '@/domain/prototype'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { actionDemand } from '@/services/lifecycle-service'
  const props = defineProps<{ demand: DemoDemand }>()
  const store = usePrototypeStore()
  const operationIds = { withdraw: crypto.randomUUID(), delete: crypto.randomUUID() }
  const confirming = ref(false)
  const emit = defineEmits<{ deleted: [] }>()
  const own = computed(() => props.demand.submitterId === store.currentUser.id)
  const deletable = computed(
    () =>
      store.currentUser.role === 'manager' || (store.currentUser.role === 'business' && own.value)
  )
  const withdrawable = computed(
    () => own.value && ['pending', 'returned'].includes(props.demand.status)
  )
  async function act(action: 'withdraw' | 'delete') {
    if (
      store.saving ||
      confirming.value ||
      (action === 'delete' ? !deletable.value : !withdrawable.value)
    )
      return
    confirming.value = true
    const target = { id: props.demand.id, version: props.demand.version }
    try {
      await ElMessageBox.confirm(
        `需求「${props.demand.name || props.demand.id}」：` +
          (action === 'delete'
            ? '将永久删除此需求、关联项目、全部进度记录及附件，并取消待发送通知，无法恢复。'
            : '撤回后退出评估，可编辑后重新提交。'),
        action === 'delete' ? '删除需求' : '撤回需求',
        {
          confirmButtonText: action === 'delete' ? '确认删除' : '确认撤回',
          cancelButtonText: '保留需求',
          type: 'warning'
        }
      )
    } catch {
      confirming.value = false
      return
    }
    try {
      if (!runtimeConfig.isPrototype) {
        await store.runLiveCommand(() =>
          actionLiveDemand(target.id, target.version, action, operationIds[action])
        )
        operationIds[action] = crypto.randomUUID()
      } else
        await store.runCommand((draft) => {
          actionDemand(draft, { demandId: props.demand.id, action })
        })
      if (action === 'delete') emit('deleted')
      ElMessage.success(action === 'delete' ? '需求已删除' : '需求已撤回')
    } catch (cause) {
      ElMessage.error(cause instanceof Error ? cause.message : '操作失败，请重试')
    } finally {
      confirming.value = false
    }
  }
</script>
