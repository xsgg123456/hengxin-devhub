<template>
  <div class="p-3">
    <p class="mb-3">本地联调账号（写入真实数据库）</p>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElButton
      v-for="user in users"
      :key="user.id"
      class="!ml-0 mb-2 w-full"
      :disabled="
        busy ||
        store.saving ||
        store.uploading ||
        store.hasUnsavedChanges ||
        user.id === store.currentUser.id
      "
      @click="login(user.id)"
      >{{ user.name }} · {{ user.department }}</ElButton
    >
    <p v-if="store.hasUnsavedChanges" class="text-sm">请先保存或关闭当前表单再切换账号。</p>
  </div>
</template>
<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { apiRequest } from '@/services/api-client'
  import { usePrototypeStore } from '@/store/modules/prototype'
  const store = usePrototypeStore()
  const users = ref<{ id: string; name: string; department: string }[]>([])
  const error = ref(''),
    busy = ref(false)
  onMounted(async () => {
    try {
      users.value = await apiRequest('/auth/dev-accounts')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '账号读取失败'
    }
  })
  async function login(userId: string) {
    if (busy.value || store.saving || store.uploading || store.hasUnsavedChanges) return
    busy.value = true
    try {
      await apiRequest('/auth/dev-login', { method: 'POST', body: { userId } })
      window.location.assign(window.location.pathname)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '登录失败'
    } finally {
      busy.value = false
    }
  }
</script>
