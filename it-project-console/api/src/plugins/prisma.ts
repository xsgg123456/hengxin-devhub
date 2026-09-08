import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

export function createPrisma(databaseUrl: string): PrismaClient {
  const connection = new URL(databaseUrl)
  const schema = connection.searchParams.get('schema') ?? 'public'
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))
    throw new Error('Database schema must be a safe identifier')
  connection.searchParams.delete('schema')
  connection.searchParams.set('options', `-c search_path=${schema}`)
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: connection.toString() }, { schema })
  })
}
