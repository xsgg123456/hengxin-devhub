import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { buildApp } from './app.js'
import { parseEnv } from './config/env.js'
import { createPrisma } from './plugins/prisma.js'
import { S3Storage } from './modules/storage/s3-storage.js'
import { AttachmentService } from './modules/attachments/attachment-service.js'

interface UploadTicket {
  attachmentId: string
  uploadUrl: string
  headers: Record<string, string>
  expiresAt: string
}
const env = parseEnv(process.env)
const db = createPrisma(env.DATABASE_URL)
const storage = new S3Storage({
  endpoint: env.S3_ENDPOINT,
  publicEndpoint: env.S3_PUBLIC_ENDPOINT,
  bucket: env.S3_BUCKET,
  region: env.S3_REGION,
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY
})
const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY
  },
  requestChecksumCalculation: 'WHEN_REQUIRED'
})
let runtime: Awaited<ReturnType<typeof buildApp>>
let cookie: string
let otherCookie: string
const actor = {
  id: 'user-business-li',
  role: 'BUSINESS' as const,
  active: true
}

async function login(userId: string) {
  const response = await runtime.app.inject({
    method: 'POST',
    url: '/api/auth/dev-login',
    headers: { origin: env.WEB_ORIGIN },
    payload: { userId }
  })
  expect(response.statusCode).toBe(200)
  return response.cookies.map((item) => `${item.name}=${item.value}`).join('; ')
}

async function demand() {
  return db.demand.create({
    data: { name: '附件隔离集成测试', ownerId: actor.id }
  })
}

function request(
  demandId: string,
  size = 12,
  overrides: Record<string, unknown> = {},
  session = cookie
) {
  return runtime.app.inject({
    method: 'POST',
    url: '/api/attachments/upload',
    headers: { origin: env.WEB_ORIGIN, cookie: session },
    payload: {
      demandId,
      size,
      kind: 'PROTOTYPE',
      name: '原型.html',
      mime: 'text/html',
      ...overrides
    }
  })
}

async function ticket(demandId: string, body = 'hello world!') {
  const response = await request(demandId, Buffer.byteLength(body))
  expect(response.statusCode).toBe(200)
  return response.json<{ data: UploadTicket }>().data
}

async function put(upload: UploadTicket, body: string) {
  const response = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: upload.headers,
    body
  })
  expect(response.status).toBe(200)
}

function confirm(id: string, session = cookie) {
  return runtime.app.inject({
    method: 'POST',
    url: `/api/attachments/${id}/confirm`,
    headers: { origin: env.WEB_ORIGIN, cookie: session }
  })
}

async function rawPut(id: string, body: string, mime = 'text/html') {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: `staging/${id}`,
      Body: body,
      ContentType: mime
    })
  )
}

beforeAll(async () => {
  if (
    env.NODE_ENV !== 'test' ||
    !env.S3_BUCKET.startsWith('itpc-test-') ||
    !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_')
  ) {
    throw new Error('附件集成测试只允许独立 test schema 与 bucket')
  }
  runtime = await buildApp(env, { db, storage, logging: false })
  cookie = await login(actor.id)
  otherCookie = await login('user-engineer-wang')
})

afterAll(async () => {
  await runtime?.app.close()
  await db.$disconnect()
  storage.close()
  s3.destroy()
})

describe('真实PostgreSQL/MinIO附件闭环', () => {
  it('上传、并发确认、全员下载和PUT重放均保持final内容', async () => {
    const item = await demand()
    const upload = await ticket(item.id)
    await put(upload, 'hello world!')
    const confirmations = await Promise.all([
      confirm(upload.attachmentId),
      confirm(upload.attachmentId)
    ])
    expect(confirmations.map((result) => result.statusCode)).toEqual([200, 200])
    const response = await runtime.app.inject({
      url: `/api/attachments/${upload.attachmentId}/download`,
      headers: { cookie: otherCookie }
    })
    expect(response.statusCode).toBe(200)
    const url = response.json<{ data: { downloadUrl: string } }>().data.downloadUrl
    const downloaded = await fetch(url)
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(downloaded.headers.get('content-type')).toBe('application/octet-stream')
    expect(await downloaded.text()).toBe('hello world!')
    await put(upload, 'changed text')
    expect(await (await fetch(url)).text()).toBe('hello world!')
    const privateUrl = new URL(url)
    privateUrl.search = ''
    expect((await fetch(privateUrl)).status).toBe(403)
    expect(
      (
        await runtime.app.inject({
          url: `/api/attachments/${upload.attachmentId}/download`
        })
      ).statusCode
    ).toBe(401)
  })

  it('HTTP入口拒绝伪类型、单文件超限与其他用户写入', async () => {
    const item = await demand()
    expect((await request(item.id, 12, { mime: 'application/pdf' })).statusCode).toBe(400)
    expect((await request(item.id, 20 * 1024 * 1024 + 1)).statusCode).toBe(400)
    expect((await request(item.id, 12, {}, otherCookie)).statusCode).toBe(403)
    expect(await db.attachment.count({ where: { demandId: item.id } })).toBe(0)
    const upload = await ticket(item.id)
    await put(upload, 'hello world!')
    expect((await confirm(upload.attachmentId, otherCookie)).statusCode).toBe(403)
  })

  it('签名绑定MIME和大小；不存在和伪造对象确认失败后可重新上传', async () => {
    const item = await demand()
    const upload = await ticket(item.id)
    expect((await confirm(upload.attachmentId)).statusCode).toBe(502)
    const mismatched = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: 'hello world!'
    })
    expect(mismatched.status).toBe(403)
    const wrongSize = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.headers,
      body: 'short'
    })
    expect(wrongSize.status).toBe(403)
    await rawPut(upload.attachmentId, 'short')
    expect((await confirm(upload.attachmentId)).statusCode).toBe(400)
    await rawPut(upload.attachmentId, 'hello world!', 'application/pdf')
    expect((await confirm(upload.attachmentId)).statusCode).toBe(400)
    expect(
      (
        await db.attachment.findUniqueOrThrow({
          where: { id: upload.attachmentId }
        })
      ).status
    ).toBe('PENDING')
    await put(upload, 'hello world!')
    expect((await confirm(upload.attachmentId)).statusCode).toBe(200)
  })

  it('并发申请在50MB预算下仅允许两份20MB保留记录', async () => {
    const item = await demand()
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => request(item.id, 20 * 1024 * 1024))
    )
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(2)
    expect(responses.filter((response) => response.statusCode === 400)).toHaveLength(2)
    const total = await db.attachment.aggregate({
      where: { demandId: item.id },
      _sum: { size: true }
    })
    expect(total._sum.size).toBe(40 * 1024 * 1024)
  })

  it('Head后对象被替换时条件Copy拒绝，数据库不产生假READY', async () => {
    const item = await demand()
    const upload = await ticket(item.id)
    await put(upload, 'hello world!')
    const racingService = new AttachmentService(db, {
      head: (key) => storage.head(key),
      presignUpload: (key, mime, size) => storage.presignUpload(key, mime, size),
      presignDownload: (key, name) => storage.presignDownload(key, name),
      delete: (key) => storage.delete(key),
      promote: async (source, target, etag) => {
        await rawPut(upload.attachmentId, 'changed text')
        await storage.promote(source, target, etag)
      }
    })
    await expect(racingService.confirmUpload(actor, upload.attachmentId)).rejects.toMatchObject({
      code: 'STORAGE_ERROR'
    })
    expect(
      (
        await db.attachment.findUniqueOrThrow({
          where: { id: upload.attachmentId }
        })
      ).status
    ).toBe('PENDING')
  })

  it('过期记录不能确认，清理删PENDING对象和READY暂存而保留final', async () => {
    const pending = await ticket((await demand()).id)
    const ready = await ticket((await demand()).id)
    await put(pending, 'hello world!')
    await put(ready, 'hello world!')
    expect((await confirm(ready.attachmentId)).statusCode).toBe(200)
    await db.attachment.updateMany({
      where: { id: { in: [pending.attachmentId, ready.attachmentId] } },
      data: { expiresAt: new Date(0) }
    })
    expect((await confirm(pending.attachmentId)).statusCode).toBe(409)
    const results = await Promise.all([
      runtime.attachments.cleanupExpired(),
      runtime.attachments.cleanupExpired()
    ])
    expect(results.flatMap((result) => result.failed)).toEqual([])
    expect(results.reduce((sum, result) => sum + result.cleaned, 0)).toBe(2)
    expect(await db.attachment.findUnique({ where: { id: pending.attachmentId } })).toBeNull()
    expect(
      (
        await db.attachment.findUniqueOrThrow({
          where: { id: ready.attachmentId }
        })
      ).stagingCleanedAt
    ).not.toBeNull()
    await expect(storage.head(`staging/${pending.attachmentId}`)).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 }
    })
    await expect(storage.head(`staging/${ready.attachmentId}`)).rejects.toMatchObject({
      $metadata: { httpStatusCode: 404 }
    })
    expect((await storage.head(`attachments/${ready.attachmentId}`)).size).toBe(12)
  })
})
