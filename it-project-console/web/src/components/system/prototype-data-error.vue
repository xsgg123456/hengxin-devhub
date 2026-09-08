<template>
  <main class="min-h-screen flex-cc bg-g-100 p-8">
    <section class="art-card w-[520px] py-14 px-10 text-center" role="alert">
      <div class="mx-auto size-15 rounded-2xl flex-cc bg-danger/10"
        ><ArtSvgIcon icon="ri:database-2-line" class="text-2xl text-danger"
      /></div>
      <p class="mt-5 text-xs font-medium text-danger">演示数据异常</p>
      <h1 class="mt-2 text-2xl font-medium text-g-900">本地演示数据无法读取</h1>
      <p class="mt-3 mb-6 text-sm leading-7 text-g-500"
        >数据可能损坏、版本不兼容或浏览器存储暂时不可用。可以重新读取；重置会清除当前演示记录并恢复初始场景。</p
      >
      <ElAlert v-if="error" :title="error" type="error" :closable="false" class="mb-5" />
      <ElButton :disabled="busy" @click="retry">重新读取</ElButton>
      <ElButton type="primary" :loading="busy" @click="reset">重置演示数据</ElButton>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { ref } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { getHomePath } from '@/router/access'
  import { syncPrototypeShell } from '@/prototype/sync-shell'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const router = useRouter()
  const prototypeStore = usePrototypeStore()
  const busy = ref(false),
    error = ref('')
  async function retry() {
    if (busy.value) return
    error.value = ''
    try {
      prototypeStore.initialize()
      if (prototypeStore.corrupted) {
        error.value = '仍无法读取，请检查浏览器存储权限，或确认后重置演示数据。'
        return
      }
      syncPrototypeShell(prototypeStore.currentUser.role)
      await router.replace(getHomePath(prototypeStore.currentUser.role))
    } catch {
      error.value = '重新读取失败，请稍后重试。'
    }
  }
  const reset = async () => {
    if (busy.value) return
    try {
      await ElMessageBox.confirm(
        '重置会清除当前演示记录并恢复固定初始场景，此操作不可撤销。',
        '重置演示数据',
        { confirmButtonText: '确认重置', cancelButtonText: '保留当前数据', type: 'warning' }
      )
    } catch {
      return
    }
    busy.value = true
    error.value = ''
    try {
      prototypeStore.reset()
      syncPrototypeShell(prototypeStore.currentUser.role)
      await router.replace(getHomePath(prototypeStore.currentUser.role))
    } catch {
      error.value = '重置失败，原数据未恢复。请检查浏览器存储权限后重试。'
    } finally {
      busy.value = false
    }
  }
</script>
