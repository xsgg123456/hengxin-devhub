import type { App } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import type { SystemRole } from '@/domain/prototype'
import { usePrototypeStore } from '@/store/modules/prototype'
import { isSupportedDevice } from '@/utils/device'
import { canAccessRole, getHomePath } from './access'
import { asyncRoutes } from './routes/asyncRoutes'
import { ElMessageBox } from 'element-plus'

export const HOME_PAGE_PATH = '/project-overview'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'PrototypeLayout',
      component: () => import('@/views/index/index.vue'),
      meta: { title: 'IT 项目管理台' },
      children: [
        ...asyncRoutes,
        {
          path: '403',
          name: 'Forbidden',
          component: () => import('@/views/exception/prototype-403.vue'),
          meta: { title: '无权限' }
        }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to, from) => {
  if (!isSupportedDevice()) return true
  const prototypeStore = usePrototypeStore()
  prototypeStore.initialize()
  if (to.fullPath !== from.fullPath && prototypeStore.uploading) return false
  if (to.fullPath !== from.fullPath && prototypeStore.hasUnsavedChanges) {
    if (prototypeStore.saving || prototypeStore.uploading) return false
    try {
      await ElMessageBox.confirm('当前表单尚未保存，离开后会丢失修改。', '离开当前页面？', {
        confirmButtonText: '放弃并离开',
        cancelButtonText: '继续编辑',
        type: 'warning'
      })
      prototypeStore.clearDirty()
    } catch {
      return false
    }
  }
  if (to.path === '/') return getHomePath(prototypeStore.currentUser.role)

  const allowedRoles = Array.isArray(to.meta.roles)
    ? to.meta.roles.filter(
        (role): role is SystemRole =>
          role === 'business' || role === 'engineer' || role === 'manager'
      )
    : undefined

  if (!canAccessRole(prototypeStore.currentUser.role, allowedRoles)) {
    return { path: '/403', query: { from: to.fullPath } }
  }
  return true
})

export function initRouter(app: App<Element>): void {
  app.use(router)
}
