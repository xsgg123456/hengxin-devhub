import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '../generated/prisma/client.js'
import type { Actor } from '../plugins/auth.js'
import { AppError } from './errors.js'

export function assertActive(actor: Actor) {
  if (!actor.active) throw new AppError(403, 'ACCOUNT_DISABLED', '账号不可用')
}
export function assertManager(actor: Actor) {
  assertActive(actor)
  if (actor.role !== 'MANAGER') throw new AppError(403, 'FORBIDDEN', '需要管理人员权限')
}
export async function lockedDemand(tx: Prisma.TransactionClient, id: string, version: number) {
  await tx.$queryRaw`SELECT id FROM demands WHERE id = ${id} FOR UPDATE`
  const row = await tx.demand.findUnique({ where: { id }, include: { project: true } })
  if (!row) throw new AppError(404, 'DEMAND_NOT_FOUND', '需求不存在')
  if (row.version !== version) throw new AppError(409, 'VERSION_CONFLICT', '记录已更新，请刷新后重试')
  return row
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
export async function command<T extends Prisma.InputJsonObject>(
  db: PrismaClient, actor: Actor, key: string, input: unknown,
  action: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  assertActive(actor)
  const hash = createHash('sha256').update(canonical(input)).digest('hex')
  return db.$transaction(async (tx) => {
    // A transaction-scoped advisory lock serializes even the first request before a receipt exists.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor.id + ':' + key}, 0))::text`
    const previous = await tx.commandReceipt.findUnique({ where: { actorId_key: { actorId: actor.id, key } } })
    if (previous) {
      if (previous.hash !== hash) throw new AppError(409, 'REQUEST_CONFLICT', '请求编号已用于不同内容')
      return previous.response as T
    }
    const result = await action(tx)
    await tx.commandReceipt.create({ data: { actorId: actor.id, key, hash, response: result } })
    return result
  }, { timeout: 15_000 })
}
