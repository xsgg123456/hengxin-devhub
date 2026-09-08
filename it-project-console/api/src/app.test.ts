import { afterEach, describe, expect, it } from 'vitest'
import { parseEnv } from './config/env.js'
import { buildApp } from './app.js'
import { assertProjectWrite, type Actor } from './plugins/auth.js'

const config = {
  NODE_ENV: 'test',
  DEV_LOGIN: 'true',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/it_project_console',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:1',
  S3_BUCKET: 'itpc-test-unit',
  S3_ACCESS_KEY: 'unit-test',
  S3_SECRET_KEY: 'unit-test-not-a-real-secret',
  WEB_ORIGIN: 'http://127.0.0.1:4317'
}
const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => {
  for (const { app } of apps.splice(0)) await app.close()
})
async function create() {
  const result = await buildApp(parseEnv(config), { logging: false })
  apps.push(result)
  return result.app
}
describe('Fastify基础边界', () => {
  it('存活检查不依赖数据库、接口文档含附件schema', async () => {
    const app = await create()
    expect((await app.inject('/health/live')).json()).toEqual({
      data: { status: 'ok' }
    })
    const docs = await app.inject('/docs/json')
    expect(docs.statusCode).toBe(200)
    expect(docs.json().paths['/api/attachments/upload'].post.requestBody).toBeDefined()
  })
  it('无登录拒绝读取、来源校验和JSON错误均不泄漏内部数据', async () => {
    const app = await create()
    expect((await app.inject('/api/me')).statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/dev-login',
          payload: { userId: 'user-manager-chen' }
        })
      ).statusCode
    ).toBe(403)
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      headers: { origin: config.WEB_ORIGIN },
      payload: { userId: 'unregistered', role: 'MANAGER' }
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR')
    const broken = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      headers: {
        origin: config.WEB_ORIGIN,
        'content-type': 'application/json'
      },
      payload: '{broken'
    })
    expect(broken.statusCode).toBe(400)
    expect(broken.body).not.toMatch(/SyntaxError|stack|postgresql/)
  })
  it('未知接口为统一404，基础安全头存在', async () => {
    const response = await (await create()).inject('/unknown')
    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NOT_FOUND')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })
  it('生产配置拒绝开发登录和非HTTPS来源且不回显凭据', () => {
    expect(() => parseEnv({ ...config, NODE_ENV: 'production' })).toThrow(/DEV_LOGIN/)
    expect(() => parseEnv({ ...config, NODE_ENV: 'production', DEV_LOGIN: 'false' })).toThrow(
      /WEB_ORIGIN/
    )
    expect(() => parseEnv({ ...config, S3_SECRET_KEY: 'secret' })).not.toThrow(/secret/)
    expect(() => parseEnv({ ...config, WEB_ORIGIN: 'http://127.0.0.1:4317/path' })).toThrow(
      /WEB_ORIGIN/
    )
  })
})
describe('项目写权限基础守卫', () => {
  const actor: Actor = {
    id: 'collaborator',
    name: '协作',
    department: '信息技术部',
    active: true,
    role: 'ENGINEER'
  }
  const project = {
    primaryOwnerId: 'primary',
    archived: false,
    status: 'ACTIVE'
  }
  it('协作只能写个人，业务不能写整体，非成员禁止写', () => {
    expect(() => assertProjectWrite(actor, project, ['collaborator'], false)).not.toThrow()
    expect(() => assertProjectWrite(actor, project, ['collaborator'])).toThrow(/维护权限/)
    expect(() =>
      assertProjectWrite({ ...actor, role: 'BUSINESS' }, project, ['collaborator'], false)
    ).toThrow()
    expect(() => assertProjectWrite(actor, project, [], false)).toThrow()
  })
  it('主责与管理可写整体，归档/取消/停用账号一律只读', () => {
    expect(() => assertProjectWrite({ ...actor, id: 'primary' }, project, [])).not.toThrow()
    expect(() => assertProjectWrite({ ...actor, role: 'MANAGER' }, project, [])).not.toThrow()
    expect(() =>
      assertProjectWrite({ ...actor, role: 'MANAGER' }, { ...project, archived: true }, [])
    ).toThrow(/只读/)
    expect(() => assertProjectWrite({ ...actor, active: false }, project, [], false)).toThrow(
      /只读/
    )
    expect(() =>
      assertProjectWrite({ ...actor, id: 'primary' }, { ...project, status: 'CANCELLED' }, [])
    ).toThrow(/只读/)
  })
})
