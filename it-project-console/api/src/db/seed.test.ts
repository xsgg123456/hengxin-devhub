import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPrisma } from '../plugins/prisma.js'
import { seedDevelopment } from './seed.js'

afterEach(() => vi.unstubAllEnvs())

describe('development seed environment boundary', () => {
  it.each(['production', '', 'staging'])(
    'rejects %s before connecting to a database',
    async (environment) => {
      vi.stubEnv('NODE_ENV', environment)
      const prisma = createPrisma('postgresql://unreachable:unreachable@127.0.0.1:1/unreachable')
      const transaction = vi.spyOn(prisma, '$transaction')
      try {
        await expect(seedDevelopment(prisma)).rejects.toThrow(
          'requires NODE_ENV=development or test'
        )
        expect(transaction).not.toHaveBeenCalled()
      } finally {
        await prisma.$disconnect()
      }
    }
  )
})
