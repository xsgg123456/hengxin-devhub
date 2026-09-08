import type { PrismaClient } from '../generated/prisma/client.js'

const users = [
  {
    id: 'user-manager-chen',
    name: '陈立峰',
    department: '信息技术部',
    departmentId: 'department-it',
    role: 'MANAGER'
  },
  {
    id: 'user-business-li',
    name: '李思敏',
    department: '市场运营部',
    departmentId: 'department-marketing',
    role: 'BUSINESS'
  },
  {
    id: 'user-engineer-wang',
    name: '王浩然',
    department: '信息技术部',
    departmentId: 'department-it',
    role: 'ENGINEER'
  },
  {
    id: 'user-engineer-zhao',
    name: '赵清越',
    department: '信息技术部',
    departmentId: 'department-it',
    role: 'ENGINEER'
  }
] as const

/** Only creates missing development fixtures; rerunning never resets real edits. */
export async function seedDevelopment(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    throw new Error('Development seed requires NODE_ENV=development or test')
  }
  await prisma.$transaction(async (tx) => {
    for (const department of [
      { id: 'department-it', name: '信息技术部' },
      { id: 'department-marketing', name: '市场运营部' }
    ]) {
      await tx.department.upsert({
        where: { id: department.id },
        create: department,
        update: {}
      })
    }
    for (const user of users) {
      await tx.user.upsert({
        where: { id: user.id },
        create: user,
        update: {}
      })
    }
    await tx.managerGrant.upsert({
      where: { userId: 'user-manager-chen' },
      create: {
        id: 'manager-grant-demo',
        userId: 'user-manager-chen',
        grantedById: 'user-manager-chen'
      },
      update: {}
    })
    await tx.demand.upsert({
      where: { id: 'demand-demo-owned' },
      create: {
        id: 'demand-demo-owned',
        name: '市场运营需求演示',
        ownerId: 'user-business-li',
        status: 'DRAFT'
      },
      update: {}
    })
    await tx.project.upsert({
      where: { id: 'project-demo' },
      create: {
        id: 'project-demo',
        name: '项目协作演示',
        primaryOwnerId: 'user-engineer-wang'
      },
      update: {}
    })
    await tx.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: 'project-demo',
          userId: 'user-engineer-zhao'
        }
      },
      create: {
        id: 'project-member-demo-zhao',
        projectId: 'project-demo',
        userId: 'user-engineer-zhao'
      },
      update: {}
    })
  })
}
