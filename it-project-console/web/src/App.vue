<template>
  <ElConfigProvider :locale="zhCn" :z-index="3000" size="default" :card="{ shadow: 'never' }">
    <UnsupportedDevice v-if="!deviceSupported" />
    <PrototypeDataError v-else-if="prototypeStore.corrupted && PrototypeDataError" />
    <div
      v-else-if="!prototypeStore.ready && (prototypeStore.authRequired || prototypeStore.loadError)"
    >
      <ProductionLogin v-if="prototypeStore.authRequired" />
      <ElResult v-else icon="error" title="服务连接失败" :sub-title="prototypeStore.loadError">
        <template #extra><ElButton @click="retryLive">重新连接</ElButton></template>
      </ElResult>
    </div>
    <div v-else-if="!prototypeStore.ready" class="app-loading" role="status">
      <ElIcon class="is-loading" :size="28"><Loading /></ElIcon>
      <span>正在加载数据…</span>
    </div>
    <RouterView v-else :key="prototypeStore.resetVersion" />
  </ElConfigProvider>
</template>

<script setup lang="ts">
  import { onBeforeMount, onBeforeUnmount, onMounted, ref, defineAsyncComponent } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import zhCn from 'element-plus/es/locale/lang/zh-cn'
  import { RouterView, useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { getHomePath } from '@/router/access'
  import { syncPrototypeShell } from '@/prototype/sync-shell'
  import { isSupportedDevice } from '@/utils/device'
  import { initializeTheme } from '@/hooks/core/useTheme'
  import UnsupportedDevice from '@/components/system/unsupported-device.vue'
  const ProductionLogin = defineAsyncComponent(() => import('@/views/auth/login/index.vue'))
  const PrototypeDataError =
    import.meta.env.MODE === 'prototype'
      ? defineAsyncComponent(() => import('@/components/system/prototype-data-error.vue'))
      : null

  const router = useRouter()
  const prototypeStore = usePrototypeStore()
  const deviceSupported = ref(isSupportedDevice())

  async function retryLive() {
    try {
      await prototypeStore.refreshLive()
      syncPrototypeShell(prototypeStore.currentUser.role)
      await router.replace(getHomePath(prototypeStore.currentUser.role))
    } catch {
      /* error remains visible */
    }
  }
  onBeforeMount(initializeTheme)

  function handleViewportChange(): void {
    const wasSupported = deviceSupported.value
    deviceSupported.value = isSupportedDevice()
    if (!wasSupported && deviceSupported.value) {
      if (import.meta.env.MODE !== 'prototype') {
        void retryLive()
        return
      }
      prototypeStore.initialize()
      syncPrototypeShell(prototypeStore.currentUser.role)
      router.replace(getHomePath(prototypeStore.currentUser.role))
    }
  }

  onMounted(() => window.addEventListener('resize', handleViewportChange))
  onBeforeUnmount(() => window.removeEventListener('resize', handleViewportChange))
</script>
