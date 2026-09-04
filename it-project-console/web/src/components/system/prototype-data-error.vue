<template>
  <main class="min-h-screen flex-cc bg-g-100 p-8">
    <section class="art-card w-[520px] py-14 px-10 text-center" role="alert">
      <div class="mx-auto size-15 rounded-2xl flex-cc bg-danger/10"
        ><ArtSvgIcon icon="ri:database-2-line" class="text-2xl text-danger"
      /></div>
      <p class="mt-5 text-xs font-medium text-danger">演示数据异常</p>
      <h1 class="mt-2 text-2xl font-medium text-g-900">本地演示数据无法读取</h1>
      <p class="mt-3 mb-6 text-sm leading-7 text-g-500"
        >数据可能被手动修改或版本不兼容。重置后会恢复固定初始场景。</p
      >
      <ElButton type="primary" @click="reset">重置演示数据</ElButton>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { getHomePath } from '@/router/access'
  import { syncPrototypeShell } from '@/prototype/sync-shell'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const router = useRouter()
  const prototypeStore = usePrototypeStore()
  const reset = async () => {
    prototypeStore.reset()
    syncPrototypeShell(prototypeStore.currentUser.role)
    await router.replace(getHomePath(prototypeStore.currentUser.role))
  }
</script>
