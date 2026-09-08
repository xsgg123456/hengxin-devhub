<template>
  <main class="min-h-screen flex-cc bg-g-100 p-8">
    <section class="art-card w-[520px] py-14 px-10 text-center" role="status">
      <ElIcon class="text-theme" :size="30"><Lock /></ElIcon>
      <p class="mt-5 text-xs font-medium text-theme">IT 项目管理台</p>
      <h1 class="mt-2 text-2xl font-medium text-g-900">企业登录暂未开放</h1>
      <p class="mt-3 text-sm leading-7 text-g-500">请联系系统管理员确认开放时间。</p>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { Lock } from '@element-plus/icons-vue'
</script>
