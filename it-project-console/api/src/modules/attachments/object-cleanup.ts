import type { PrismaClient } from '../../generated/prisma/client.js'
import type { ObjectStorage } from '../storage/s3-storage.js'
export async function cleanupDeletedObjects(db: PrismaClient, storage: ObjectStorage, now: Date) {
  const jobs = await db.objectDeletion.findMany({
    where: { availableAt: { lte: now } },
    take: 100,
    orderBy: { availableAt: 'asc' }
  })
  const failed: string[] = []
  let cleaned = 0
  for (const job of jobs) {
    try {
      await storage.delete(job.objectKey)
      await db.objectDeletion.deleteMany({ where: { id: job.id } })
      cleaned++
    } catch {
      failed.push(job.id)
      await db.objectDeletion.updateMany({
        where: { id: job.id },
        data: { attempts: { increment: 1 }, availableAt: new Date(now.getTime() + 60000) }
      })
    }
  }
  return { cleaned, failed }
}
