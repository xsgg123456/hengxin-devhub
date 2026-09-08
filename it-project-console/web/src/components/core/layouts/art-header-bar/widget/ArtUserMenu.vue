<template>
  <ElPopover
    ref="userMenuPopover"
    placement="bottom-end"
    :width="318"
    :hide-after="0"
    :offset="10"
    trigger="click"
    :show-arrow="false"
    popper-class="user-menu-popover prototype-identity-popover"
  >
    <template #reference>
      <button class="prototype-user-control" type="button" :aria-label="menuLabel">
        <span v-if="modeLabel" class="prototype-mode-label">{{ modeLabel }}</span>
        <span class="prototype-avatar" aria-hidden="true">{{ initials }}</span>
        <span class="prototype-user-copy">
          <strong>{{ prototypeStore.currentUser.name }}</strong>
          <small>{{ prototypeStore.currentUser.roleLabel }}</small>
        </span>
        <ArtSvgIcon icon="ri:arrow-down-s-line" />
      </button>
    </template>

    <ModeControls v-if="ModeControls" @close="userMenuPopover?.hide()" />
    <ElButton
      v-else
      :disabled="
        prototypeStore.saving || prototypeStore.uploading || prototypeStore.hasUnsavedChanges
      "
      @click="logout"
      >退出登录</ElButton
    >
  </ElPopover>
</template>

<script setup lang="ts">
  import { computed, ref, defineAsyncComponent } from 'vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { apiRequest } from '@/services/api-client'
  const prototypeStore = usePrototypeStore()
  const userMenuPopover = ref<{ hide: () => void }>()
  const initials = computed(() => prototypeStore.currentUser.name.slice(-2))
  const menuLabel = import.meta.env.MODE === 'prototype' ? '切换演示身份' : '当前用户'
  const modeLabel =
    import.meta.env.MODE === 'prototype'
      ? '演示模式'
      : import.meta.env.MODE === 'live'
        ? '本地联调'
        : ''
  const ModeControls =
    import.meta.env.MODE === 'prototype'
      ? defineAsyncComponent(() => import('@/components/system/prototype-user-controls.vue'))
      : import.meta.env.MODE === 'live'
        ? defineAsyncComponent(() => import('@/components/system/live-user-controls.vue'))
        : null
  async function logout() {
    await apiRequest('/auth/logout', { method: 'POST' })
    window.location.reload()
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
