import { createPrisma } from '../src/plugins/prisma.js'
export async function seedProjectEditFixture(env: NodeJS.ProcessEnv) {
  const url = new URL(env.DATABASE_URL!)
  if (env.NODE_ENV !== 'test' || !['127.0.0.1','localhost'].includes(url.hostname) ||
    !url.searchParams.get('schema')?.startsWith('itpc_test_')) throw new Error('完整编辑样例仅用于隔离浏览器测试')
  const db = createPrisma(env.DATABASE_URL!)
  try {
    for (const pending of [false,true]) {
      const demand = await db.demand.create({ data: { name: '完整编辑测试需求', ownerId: 'user-business-li', status: 'APPROVED' } })
      await db.project.create({ data: { name: pending ? '【迁移待核实】工程师核实测试' : '正常项目完整编辑测试',
        department: '信息技术部', demandId: demand.id, primaryOwnerId: 'user-engineer-wang',
        businessOwnerId: 'user-business-li', acceptanceOwnerId: 'user-business-li', migrationVerified: !pending,
        currentLaunchDate: new Date('2099-12-01'), currentDeliveryDate: new Date('2099-12-02'),
        members: { create: { userId: 'user-engineer-zhao' } } } })
    }
  } finally { await db.$disconnect() }
}
