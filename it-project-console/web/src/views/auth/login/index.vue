<!-- 原位保留 Art 授权页布局，身份验证由企业服务完成。 -->
<template>
  <div class="flex w-full h-screen">
    <LoginLeftView fixed-theme />
    <div class="relative flex-1">
      <AuthTopBar fixed-theme />
      <div class="auth-right-wrap">
        <div class="form">
          <h3 class="title">登录 IT 项目管理台</h3>
          <p class="sub-title">通过钉钉登录，权限由企业组织身份自动分配。</p>
          <div class="mt-8" aria-live="polite" :aria-busy="busy">
            <p v-if="busy" class="mb-5" role="status">正在确认你的身份…</p>
            <ElAlert v-if="error" class="mb-5" :title="error" type="error" :closable="false" />
            <ElButton
              v-if="desktopDingTalk || error"
              class="w-full custom-height mb-4"
              type="primary"
              :loading="busy"
              @click="start()"
              >{{ desktopDingTalk ? '重新登录' : '重新检查登录配置' }}</ElButton
            >
            <ElButton
              v-if="config?.enabled && config.clientId && config.corpId"
              class="!ml-0 w-full custom-height"
              :type="desktopDingTalk ? 'default' : 'primary'"
              :disabled="busy"
              @click="scanLogin"
              >钉钉扫码登录</ElButton
            >
            <p class="mt-4 text-sm text-g-600">仅限本公司成员使用；授权失败请重试或联系管理员。</p>
          </div>
          <LiveLogin v-if="LiveLogin" class="mt-5" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
  import { useRouter } from 'vue-router'
  import LoginLeftView from '@/components/core/views/login/LoginLeftView.vue'
  import AuthTopBar from '@/components/core/views/login/AuthTopBar.vue'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { syncPrototypeShell } from '@/prototype/sync-shell'
  import { getHomePath } from '@/router/access'
  import { useDingTalkLogin } from '@/hooks/business/use-dingtalk-login'
  import { dingTalkStartUrl } from '@/services/dingtalk-auth'
  import { isDesktopDingTalk } from '@/utils/dingtalk/runtime'
  import { isSupportedDevice } from '@/utils/device'

  defineOptions({ name: 'Login' })
  const LiveLogin =
    import.meta.env.MODE === 'live'
      ? defineAsyncComponent(() => import('@/components/system/live-user-controls.vue'))
      : null
  const store = usePrototypeStore()
  const router = useRouter()
  const desktopDingTalk = isDesktopDingTalk(window.navigator.userAgent)
  const { busy, error, config, start, cancel } = useDingTalkLogin(async () => {
    const target = window.location.hash.slice(1)
    await store.refreshLive()
    syncPrototypeShell(store.currentUser.role)
    await router.replace(
      target && target !== '/' && !target.startsWith('/auth/login')
        ? target
        : getHomePath(store.currentUser.role)
    )
  })
  function scanLogin() {
    if (busy.value || !config.value?.enabled || !isSupportedDevice()) return
    window.location.assign(dingTalkStartUrl(window.location.hash))
  }
  onMounted(() => {
    const authorizationFailed = new URLSearchParams(window.location.hash.split('?')[1]).has(
      'dingError'
    )
    void start(!authorizationFailed).then(() => {
      if (authorizationFailed && !error.value) error.value = '钉钉授权失败或已取消，请重新登录'
    })
  })
  onBeforeUnmount(cancel)
</script>

<style scoped>
  @import './style.css';

  /* 保留母版装饰的最终姿态，按设计规范取消首屏入场动效。 */
  :deep(.login-left-view *),
  :deep(.login-left-view *::before),
  :deep(.login-left-view *::after) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }

  @media (prefers-reduced-motion: reduce) {
    :deep(.login-left-view *) {
      transition: none !important;
    }
  }

  .auth-right-wrap {
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }

  .auth-right-wrap .form {
    height: auto;
  }
</style>
