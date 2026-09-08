import 'dotenv/config'
import { createPrisma } from '../src/plugins/prisma.js'
import { seedDevelopment } from '../src/db/seed.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const prisma = createPrisma(databaseUrl)
try {
  await seedDevelopment(prisma)
} finally {
  await prisma.$disconnect()
}
