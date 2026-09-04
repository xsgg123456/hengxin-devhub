import type { RouteRecordRaw } from 'vue-router'

export const asyncRoutes: RouteRecordRaw[] = [
  {
    path: 'project-overview',
    name: 'ProjectOverview',
    component: () => import('@/views/project-overview/index.vue'),
    meta: { title: '项目总览', roles: ['manager'] }
  },
  {
    path: 'my-projects',
    name: 'MyProjects',
    component: () => import('@/views/my-projects/index.vue'),
    meta: { title: '我的项目', roles: ['engineer'] }
  },
  {
    path: 'my-demands',
    name: 'MyDemands',
    component: () => import('@/views/my-demands/index.vue'),
    meta: { title: '我的需求', roles: ['business'] }
  }
]
