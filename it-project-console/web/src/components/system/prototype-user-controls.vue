<template>
  <div class="prototype-identity-menu">
    <div class="identity-menu-heading">
      <strong>切换演示身份</strong>
      <span>四个演示账号 · 三类系统角色</span>
    </div>
    <button
      v-for="user in demoUsers"
      :key="user.id"
      type="button"
      class="identity-menu-item"
      :class="{ 'is-current': user.id === prototypeStore.currentUser.id }"
      :disabled="prototypeStore.saving || user.id === prototypeStore.currentUser.id"
      @click="switchIdentity(user.id)"
    >
      <span class="identity-mini-avatar">{{ user.name.slice(-2) }}</span>
      <span
        ><strong>{{ user.name }}</strong
        ><small>{{ user.roleLabel }} · {{ user.department }}</small></span
      >
      <ArtSvgIcon v-if="user.id === prototypeStore.currentUser.id" icon="ri:check-line" />
    </button>
    <PrototypeScenarioMenu />
    <ElAlert v-if="menuError" :title="menuError" type="error" :closable="false" />
    <button
      class="prototype-reset-action"
      type="button"
      :disabled="prototypeStore.saving"
      @click="resetPrototype"
    >
      <ArtSvgIcon icon="ri:restart-line" />
      <span>重置演示数据</span>
    </button>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useRouter } from 'vue-router'
  import { DEMO_USERS } from '@/mocks/auth-context'
  import { getHomePath } from '@/router/access'
  import { syncPrototypeShell } from '@/prototype/sync-shell'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import PrototypeScenarioMenu from '@/components/system/prototype-scenario-menu.vue'

  const emit = defineEmits<{ close: [] }>()

  const router = useRouter()
  const prototypeStore = usePrototypeStore()
  const menuError = ref('')
  const demoUsers = computed(() => prototypeStore.database?.users ?? DEMO_USERS)

  async function switchIdentity(userId: string): Promise<void> {
    if (prototypeStore.saving) return
    menuError.value = ''
    if (prototypeStore.hasUnsavedChanges) {
      try {
        await ElMessageBox.confirm('当前表单尚未保存，切换身份后会丢失修改。', '切换演示身份？', {
          confirmButtonText: '放弃并切换',
          cancelButtonText: '继续编辑',
          type: 'warning'
        })
      } catch {
        return
      }
    }
    try {
      prototypeStore.switchUser(userId)
      prototypeStore.clearDirty()
    } catch (error) {
      menuError.value = error instanceof Error ? error.message : '身份切换失败'
      return
    }
    syncPrototypeShell(prototypeStore.currentUser.role)
    emit('close')
    await router.push(getHomePath(prototypeStore.currentUser.role))
  }

  async function resetPrototype(): Promise<void> {
    if (prototypeStore.saving) return
    menuError.value = ''
    try {
      await ElMessageBox.confirm('这会清除当前演示进度，并恢复固定初始场景。', '重置演示数据', {
        confirmButtonText: '确认重置',
        cancelButtonText: '保留当前数据',
        type: 'warning'
      })
      prototypeStore.reset()
      syncPrototypeShell(prototypeStore.currentUser.role)
      emit('close')
      await router.push(getHomePath(prototypeStore.currentUser.role))
      ElMessage.success('演示数据已重置')
    } catch (error) {
      if (error instanceof Error) menuError.value = error.message
    }
  }
</script>
<style lang="scss" scoped>
  .prototype-user-control {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 44px;
    padding: 3px 14px 3px 5px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--art-gray-800);
    line-height: 1.2;
    cursor: pointer;
  }
  .prototype-user-control:hover {
    background: var(--art-gray-200);
  }
  .prototype-mode-label {
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 11px;
    font-weight: 600;
  }
  .prototype-avatar,
  .identity-mini-avatar {
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }
  .prototype-avatar {
    width: 34px;
    height: 34px;
  }
  .prototype-user-copy {
    display: grid;
    min-width: 82px;
    gap: 3px;
    text-align: left;
  }
  .prototype-user-copy strong {
    font-size: 13px;
    line-height: 1.2;
  }
  .prototype-user-copy small {
    color: var(--art-gray-500);
    font-size: 11px;
    line-height: 1.2;
  }
  .prototype-identity-menu {
    padding: 8px;
  }
  .identity-menu-heading {
    display: grid;
    gap: 3px;
    padding: 8px 8px 12px;
    border-bottom: 1px solid var(--art-gray-300);
  }
  .identity-menu-heading strong {
    font-size: 14px;
  }
  .identity-menu-heading span {
    color: var(--art-gray-500);
    font-size: 12px;
  }
  .identity-menu-item {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 20px;
    width: 100%;
    min-height: 58px;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
    padding: 7px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--art-gray-800);
    text-align: left;
    cursor: pointer;
  }
  .identity-menu-item:hover {
    background: var(--art-gray-200);
  }
  .identity-menu-item.is-current {
    background: var(--el-color-primary-light-9);
    cursor: default;
  }
  .identity-menu-item > span:nth-child(2) {
    display: grid;
    gap: 3px;
  }
  .identity-menu-item small {
    color: var(--art-gray-500);
    font-size: 11px;
  }
  .identity-mini-avatar {
    width: 34px;
    height: 34px;
    background: var(--art-gray-700);
  }
  .prototype-reset-action {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    gap: 9px;
    margin-top: 7px;
    padding: 0 10px;
    border: 0;
    border-top: 1px solid var(--art-gray-300);
    background: transparent;
    color: var(--el-color-danger);
    cursor: pointer;
  }
</style>
