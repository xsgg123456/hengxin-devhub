<template>
  <BusinessPageState>
    <div>
      <div class="flex-cb mb-5"
        ><div
          ><h2 class="text-xl font-medium">管理人员名单</h2
          ><p class="mt-1.5 text-sm text-g-500"
            >管理权限覆盖部门默认角色，至少保留一名有效管理人员</p
          ></div
        ><ElButton type="primary" @click="addOpen = true">添加管理人员</ElButton></div
      >
      <div class="art-card p-5">
        <ElTable :data="managers" row-key="id">
          <ElTableColumn prop="name" label="姓名" min-width="90" />
          <ElTableColumn prop="department" label="部门" min-width="120" />
          <ElTableColumn prop="id" label="演示组织身份标识" min-width="185" />
          <ElTableColumn label="添加人" min-width="90"
            ><template #default="{ row }">{{
              grant(row.id) ? userName(grant(row.id)!.authorId) : '初始配置'
            }}</template></ElTableColumn
          >
          <ElTableColumn label="添加时间" min-width="150"
            ><template #default="{ row }">{{
              grant(row.id) ? displayTime(grant(row.id)!.createdAt) : '初始名单'
            }}</template></ElTableColumn
          >
          <ElTableColumn label="状态" width="80"
            ><template #default><ElTag type="success">有效</ElTag></template></ElTableColumn
          >
          <ElTableColumn label="操作" width="110"
            ><template #default="{ row }"
              ><ElButton type="danger" link :disabled="store.saving" @click="remove(row.id)"
                >移除权限</ElButton
              ></template
            ></ElTableColumn
          >
        </ElTable>
        <ElAlert v-if="error" class="mt-4" :title="error" type="error" :closable="false" />
      </div>
      <ElDialog v-model="addOpen" title="添加管理人员" width="440px" :close-on-click-modal="false">
        <ElForm label-position="top"
          ><ElFormItem label="选择组织成员"
            ><ElSelect
              v-model="selectedId"
              filterable
              placeholder="搜索姓名或选择现有成员"
              aria-label="组织成员"
              style="width: 100%"
              ><ElOption
                v-for="user in candidates"
                :key="user.id"
                :label="`${user.name} · ${user.department}`"
                :value="user.id" /></ElSelect></ElFormItem
        ></ElForm>
        <p class="text-sm text-g-600">添加后可立项、纠正项目及维护管理人员名单。</p>
        <ElAlert v-if="addError" class="mt-4" :title="addError" type="error" :closable="false" />
        <template #footer
          ><ElButton :disabled="store.saving" @click="addOpen = false">取消</ElButton
          ><ElButton type="primary" :loading="store.saving" @click="add"
            >确认添加</ElButton
          ></template
        >
      </ElDialog>
    </div>
  </BusinessPageState>
</template>
<script setup lang="ts">
  import BusinessPageState from '@/components/system/business-page-state.vue'
  import { computed, ref, watch } from 'vue'
  import { ElMessage, ElMessageBox } from 'element-plus'
  import { useRouter } from 'vue-router'
  import { usePrototypeStore } from '@/store/modules/prototype'
  import { setManager } from '@/services/management-service'
  import { displayTime } from '@/utils/project-display'
  import { syncPrototypeShell } from '@/prototype/sync-shell'
  import { getHomePath } from '@/router/access'
  const store = usePrototypeStore(),
    router = useRouter()
  const error = ref(''),
    addError = ref(''),
    addOpen = ref(false),
    selectedId = ref('')
  const managers = computed(() => store.database?.users.filter((u) => u.role === 'manager') ?? [])
  const candidates = computed(() => store.database?.users.filter((u) => u.role !== 'manager') ?? [])
  const userName = (id: string) => store.database?.users.find((u) => u.id === id)?.name ?? id
  const grant = (id: string) =>
    store.database?.lifecycleEvents.find(
      (e) => e.entityType === 'user' && e.entityId === id && e.action === 'grant'
    )
  watch(addOpen, () => {
    addError.value = ''
    selectedId.value = ''
  })
  async function add() {
    if (!selectedId.value) {
      addError.value = '请选择组织成员'
      return
    }
    try {
      await store.runCommand((draft) => {
        setManager(draft, { userId: selectedId.value, enabled: true })
      })
      addOpen.value = false
      ElMessage.success('管理权限已添加')
    } catch (cause) {
      addError.value = cause instanceof Error ? cause.message : '添加失败，请重试'
    }
  }
  async function remove(userId: string) {
    error.value = ''
    try {
      await ElMessageBox.confirm(
        `移除 ${userName(userId)} 的管理权限后，将恢复部门默认角色。`,
        '移除管理权限',
        { confirmButtonText: '确认移除', cancelButtonText: '保留权限', type: 'warning' }
      )
    } catch {
      return
    }
    try {
      await store.runCommand((draft) => {
        setManager(draft, { userId, enabled: false })
      })
      syncPrototypeShell(store.currentUser.role)
      if (store.currentUser.role !== 'manager')
        await router.replace(getHomePath(store.currentUser.role))
      ElMessage.success('管理权限已移除')
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '移除失败，请重试'
    }
  }
</script>
