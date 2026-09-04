import type { App } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import type { SystemRole } from '@/domain/prototype'
import { runtimeConfig } from '@/config/runtime'
import { usePrototypeStore } from '@/store/modules/prototype'
import { isSupportedDevice } from '@/utils/device'
import { canAccessRole, getHomePath } from './access'
import { asyncRoutes } from './routes/asyncRoutes'

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

router.beforeEach((to) => {
  if (!runtimeConfig.isPrototype || !isSupportedDevice()) return true
  const prototypeStore = usePrototypeStore()
  prototypeStore.initialize()
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
