import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { parseEnv } from './config/env.js'
import { createPrisma } from './plugins/prisma.js'
import { sessionCookie } from './plugins/auth.js'

const env = parseEnv(process.env)
if (
  env.NODE_ENV !== 'test' ||
  !new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_') ||
  !env.S3_BUCKET.startsWith('itpc-test-')
)
  throw new Error('必须由隔离集成测试入口运行')
const db = createPrisma(env.DATABASE_URL)
let app: Awaited<ReturnType<typeof buildApp>>['app']
const issuedHashes: string[] = []
const manager = 'user-manager-chen'
const business = 'user-business-li'

async function login(userId: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/dev-login',
    headers: { origin: env.WEB_ORIGIN },
    payload: { userId }
  })
  expect(response.statusCode).toBe(200)
  const cookie = response.cookies.find((item) => item.name === sessionCookie)
  expect(cookie).toBeDefined()
  const token = cookie!.value
  const hash = createHash('sha256').update(token).digest('hex')
  issuedHashes.push(hash)
  return {
    token,
    hash,
    headers: { cookie: `${sessionCookie}=${token}` },
    response
  }
}

beforeAll(async () => {
  app = (await buildApp(env, { logging: false })).app
  await app.ready()
})
afterEach(async () => {
  await db.session.deleteMany({
    where: { tokenHash: { in: issuedHashes.splice(0) } }
  })
})
afterAll(async () => {
  await app?.close()
  await db.$disconnect()
})

describe('database-backed authentication and immediate permission changes', () => {
  it('rejects absent, malformed and unknown sessions', async () => {
    for (const cookie of ['', `${sessionCookie}=invalid`, `${sessionCookie}=${'a'.repeat(64)}`]) {
      const response = await app.inject({
        url: '/api/me',
        headers: { cookie }
      })
      expect(response.statusCode).toBe(401)
      expect(response.body).not.toMatch(/stack|tokenHash|postgresql/)
    }
  })

  it('stores only a hash and returns the authenticated identity with protected cookies', async () => {
    const session = await login(business)
    const record = await db.session.findUniqueOrThrow({
      where: { tokenHash: session.hash }
    })
    expect(record.userId).toBe(business)
    expect(record.tokenHash).not.toBe(session.token)
    expect(record.tokenHash).toBe(session.hash)
    const cookieHeader = session.response.headers['set-cookie']
    expect(cookieHeader).toEqual(expect.stringContaining('HttpOnly'))
    expect(cookieHeader).toEqual(expect.stringContaining('SameSite=Lax'))
    expect(session.response.body).not.toContain(session.token)
    const me = await app.inject({ url: '/api/me', headers: session.headers })
    expect(me.statusCode).toBe(200)
    expect(me.json().data).toMatchObject({ id: business, role: 'BUSINESS' })
    expect(me.body).not.toMatch(/tokenHash|expiresAt/)
  })

  it('restricts settings to managers', async () => {
    const ordinary = await login(business)
    expect(
      (
        await app.inject({
          url: '/api/admin/settings',
          headers: ordinary.headers
        })
      ).statusCode
    ).toBe(403)
    const privileged = await login(manager)
    expect(
      (
        await app.inject({
          url: '/api/admin/settings',
          headers: privileged.headers
        })
      ).statusCode
    ).toBe(200)
  })

  it('rejects expired sessions', async () => {
    const session = await login(business)
    await db.session.update({
      where: { tokenHash: session.hash },
      data: { expiresAt: new Date(0) }
    })
    expect((await app.inject({ url: '/api/me', headers: session.headers })).statusCode).toBe(401)
  })

  it('rejects a previously authenticated user immediately after deactivation', async () => {
    const session = await login(business)
    const original = await db.user.findUniqueOrThrow({
      where: { id: business }
    })
    try {
      await db.user.update({
        where: { id: business },
        data: { active: false }
      })
      expect((await app.inject({ url: '/api/me', headers: session.headers })).statusCode).toBe(401)
      const retry = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        headers: { origin: env.WEB_ORIGIN },
        payload: { userId: business }
      })
      expect(retry.statusCode).toBe(403)
    } finally {
      await db.user.update({
        where: { id: business },
        data: { active: original.active }
      })
    }
  })

  it('rechecks role on every request instead of trusting the login snapshot', async () => {
    const session = await login(manager)
    const original = await db.user.findUniqueOrThrow({
      where: { id: manager }
    })
    try {
      await db.user.update({
        where: { id: manager },
        data: { role: 'BUSINESS' }
      })
      expect(
        (
          await app.inject({
            url: '/api/admin/settings',
            headers: session.headers
          })
        ).statusCode
      ).toBe(403)
      expect(
        (await app.inject({ url: '/api/me', headers: session.headers })).json().data.role
      ).toBe('BUSINESS')
    } finally {
      await db.user.update({
        where: { id: manager },
        data: { role: original.role }
      })
    }
  })

  it('requires the configured Origin for writes and preserves the session when rejected', async () => {
    const session = await login(business)
    for (const origin of [undefined, 'https://untrusted.example']) {
      const headers = origin ? { ...session.headers, origin } : session.headers
      expect(
        (await app.inject({ method: 'POST', url: '/api/auth/logout', headers })).statusCode
      ).toBe(403)
    }
    expect(await db.session.findUnique({ where: { tokenHash: session.hash } })).not.toBeNull()
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/dev-login',
          headers: { origin: 'https://untrusted.example' },
          payload: { userId: manager }
        })
      ).statusCode
    ).toBe(403)
  })

  it('logout revokes the persisted session and clears the cookie', async () => {
    const session = await login(business)
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...session.headers, origin: env.WEB_ORIGIN }
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['set-cookie']).toEqual(
      expect.stringContaining('Expires=Thu, 01 Jan 1970')
    )
    expect(await db.session.findUnique({ where: { tokenHash: session.hash } })).toBeNull()
    expect((await app.inject({ url: '/api/me', headers: session.headers })).statusCode).toBe(401)
  })

  it('production exposes neither development login nor documentation', async () => {
    const production = (
      await buildApp(
        parseEnv({
          ...process.env,
          NODE_ENV: 'production',
          DEV_LOGIN: 'false',
          WEB_ORIGIN: 'https://console.example'
        }),
        { logging: false }
      )
    ).app
    try {
      const loginResponse = await production.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        headers: { origin: 'https://console.example' },
        payload: { userId: manager }
      })
      expect(loginResponse.statusCode).toBe(404)
      for (const url of ['/docs', '/docs/', '/docs/json'])
        expect((await production.inject({ url })).statusCode).toBe(404)
    } finally {
      await production.close()
    }
  })
})
