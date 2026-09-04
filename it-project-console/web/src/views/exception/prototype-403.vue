<template>
  <div class="min-h-[520px] flex-cc">
    <div class="art-card w-[520px] py-14 px-10 text-center">
      <div class="mx-auto size-15 rounded-2xl flex-cc bg-theme/10"
        ><ArtSvgIcon icon="ri:lock-2-line" class="text-2xl text-theme"
      /></div>
      <p class="mt-5 text-xs font-medium text-theme">403 · 角色权限限制</p>
      <h2 class="mt-2 text-xl font-medium text-g-900">当前身份无法访问这个页面</h2>
      <p class="mt-3 mb-6 text-sm leading-7 text-g-500"
        >{{
          prototypeStore.currentUser.roleLabel
        }}仅能查看与职责相关的数据。你可以切换演示身份，或返回当前角色首页。</p
      >
      <ElButton type="primary" @click="goHome">返回我的首页</ElButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'
  import { getHomePath } from '@/router/access'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const router = useRouter()
  const prototypeStore = usePrototypeStore()
  const goHome = () => router.push(getHomePath(prototypeStore.currentUser.role))
</script>
