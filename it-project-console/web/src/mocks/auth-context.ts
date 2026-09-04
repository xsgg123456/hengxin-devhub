import type { DemoUser } from '@/domain/prototype'

export const DEMO_USERS = [
  {
    id: 'user-manager-chen',
    name: '陈立峰',
    department: '信息技术部',
    role: 'manager',
    title: 'IT 负责人'
  },
  {
    id: 'user-business-li',
    name: '李思敏',
    department: '市场运营部',
    role: 'business',
    title: '业务需求负责人'
  },
  {
    id: 'user-engineer-wang',
    name: '王浩然',
    department: '信息技术部',
    role: 'engineer',
    persona: 'primary',
    title: '项目主负责人'
  },
  {
    id: 'user-engineer-zhao',
    name: '赵清越',
    department: '信息技术部',
    role: 'engineer',
    persona: 'collaborator',
    title: '项目协作人员'
  }
] as const satisfies readonly DemoUser[]

export const DEFAULT_DEMO_USER_ID = DEMO_USERS[0].id

export function getDemoUser(userId: string): DemoUser | undefined {
  return DEMO_USERS.find((user) => user.id === userId)
}
