import type { RouteRecordRaw } from 'vue-router'

export const asyncRoutes: RouteRecordRaw[] = [
  {
    path: 'today-tasks',
    name: 'TodayTasks',
    component: () => import('@/views/today-tasks/index.vue'),
    meta: { title: '职责待办', roles: ['manager', 'engineer', 'business'] }
  },
  {
    path: 'monthly-gantt',
    name: 'MonthlyGantt',
    component: () => import('@/views/monthly-gantt/index.vue'),
    meta: { title: '甘特图', roles: ['manager', 'engineer', 'business'] }
  },
  {
    path: 'manager-grants',
    name: 'ManagerGrants',
    component: () => import('@/views/manager-grants/index.vue'),
    meta: { title: '管理人员名单', roles: ['manager'] }
  },
  {
    path: 'project-overview',
    name: 'ProjectOverview',
    component: () => import('@/views/project-overview/index.vue'),
    meta: { title: '项目总览', roles: ['manager', 'engineer', 'business'] }
  },
  {
    path: 'my-projects',
    name: 'MyProjects',
    component: () => import('@/views/my-projects/index.vue'),
    meta: { title: '我的项目 / 全部项目', roles: ['manager', 'engineer', 'business'] }
  },
  {
    path: 'my-demands',
    name: 'MyDemands',
    component: () => import('@/views/my-demands/index.vue'),
    meta: { title: '我的需求 / 需求池', roles: ['manager', 'engineer', 'business'] }
  }
]
