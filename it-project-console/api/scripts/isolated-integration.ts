import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { Client } from 'pg'
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
} from '@aws-sdk/client-s3'
import { parseEnv } from '../src/config/env.js'

export async function isolatedIntegration(action: (context: { env: NodeJS.ProcessEnv; run: (path: string, args: string[]) => Promise<void> }) => Promise<void>) {
const env = parseEnv(process.env)
const database = new URL(env.DATABASE_URL)
const endpoint = new URL(env.S3_ENDPOINT)
if (
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  database.pathname !== '/it_project_console' ||
  !['localhost', '127.0.0.1'].includes(endpoint.hostname)
)
  throw new Error('集成测试仅允许本机独立 it_project_console 数据库与存储')
const suffix = randomBytes(8).toString('hex')
const schema = `itpc_test_${suffix}`,
  bucket = `itpc-test-${suffix}`
database.searchParams.delete('schema')
database.searchParams.delete('options')
const db = new Client({ connectionString: database.toString() })
const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY
  }
})
database.searchParams.set('schema', schema)
const isolated = {
  ...process.env,
  NODE_ENV: 'test',
  DEV_LOGIN: 'true',
  DINGTALK_CLIENT_ID: '',
  DINGTALK_CLIENT_SECRET: '',
  DINGTALK_CORP_ID: '',
  DINGTALK_REDIRECT_URI: '',
  DINGTALK_NOTIFICATIONS_ENABLED: 'false',
  DATABASE_URL: database.toString(),
  S3_BUCKET: bucket
}
function run(path: string, args: string[]) {
  return new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [resolve(path), ...args], {
      env: isolated,
      stdio: 'inherit',
      timeout: 180000,
      windowsHide: true
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? done() : reject(new Error(`隔离测试子进程失败 (${code})`))
    )
  })
}
let schemaCreated = false,
  bucketCreated = false
try {
  await db.connect()
  await db.query(`CREATE SCHEMA "${schema}"`)
  schemaCreated = true
  await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  bucketCreated = true
  await run('node_modules/prisma/build/index.js', ['migrate', 'deploy'])
  await run('node_modules/prisma/build/index.js', ['migrate', 'deploy'])
  await run('node_modules/tsx/dist/cli.mjs', ['prisma/seed.ts'])
  await action({ env: isolated, run })
} finally {
  try {
    if (bucketCreated) {
      let next: string | undefined
      do {
        const page = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: next })
        )
        if (page.Contents?.length)
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: page.Contents.map((o) => ({ Key: o.Key! })) }
            })
          )
        next = page.NextContinuationToken
      } while (next)
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
    }
  } finally {
    if (schemaCreated) await db.query(`DROP SCHEMA "${schema}" CASCADE`)
    await db.end()
    s3.destroy()
    console.log('本次测试独立 schema 与 Bucket 已回收')
  }
}


}
