<template>
  <ElConfigProvider :locale="zhCn" :z-index="3000" size="default" :card="{ shadow: 'never' }">
    <UnsupportedDevice v-if="!deviceSupported" />
    <PrototypeDataError v-else-if="prototypeStore.corrupted" />
    <div v-else-if="!prototypeStore.ready" class="app-loading" role="status">
      <ElIcon class="is-loading" :size="28"><Loading /></ElIcon>
      <span>正在准备演示数据…</span>
    </div>
    <RouterView v-else />
  </ElConfigProvider>
</template>

<script setup lang="ts">
  import { onBeforeMount, onBeforeUnmount, onMounted, ref } from 'vue'
  import { Loading } from '@element-plus/icons-vue'
  import zhCn from 'element-plus/es/locale/lang/zh-cn'
  import { RouterView, useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { getHomePath } from '@/router/access'
  import { syncPrototypeShell } from '@/prototype/sync-shell'
  import { isSupportedDevice } from '@/utils/device'
  import { initializeTheme } from '@/hooks/core/useTheme'
  import UnsupportedDevice from '@/components/system/unsupported-device.vue'
  import PrototypeDataError from '@/components/system/prototype-data-error.vue'

  const router = useRouter()
  const prototypeStore = usePrototypeStore()
  const deviceSupported = ref(isSupportedDevice())

  onBeforeMount(initializeTheme)

  function handleViewportChange(): void {
    const wasSupported = deviceSupported.value
    deviceSupported.value = isSupportedDevice()
    if (!wasSupported && deviceSupported.value) {
      prototypeStore.initialize()
      syncPrototypeShell(prototypeStore.currentUser.role)
      router.replace(getHomePath(prototypeStore.currentUser.role))
    }
  }

  onMounted(() => window.addEventListener('resize', handleViewportChange))
  onBeforeUnmount(() => window.removeEventListener('resize', handleViewportChange))
</script>
