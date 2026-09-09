import { expect, it } from 'vitest'
import { parseEnv } from './env.js'

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
  S3_ENDPOINT: 'http://localhost:9000', S3_PUBLIC_ENDPOINT: 'https://fixture.example',
  S3_BUCKET: 'fixture-bucket', S3_ACCESS_KEY: 'fixture', S3_SECRET_KEY: 'fixture-secret-not-real',
  NEXTAUTH_URL: 'https://fixture.example:8443/',
  DINGTALK_APP_KEY: 'legacy-key', DINGTALK_APP_SECRET: 'legacy-secret',
  DINGTALK_CORP_ID: 'legacy-corp', DINGTALK_AGENT_ID: '123'
}

it('直接加载旧应用配置并保持原域名端口与回调路径', () => {
  const env = parseEnv(base)
  expect(env.WEB_ORIGIN).toBe('https://fixture.example:8443')
  expect(env.DINGTALK_REDIRECT_URI).toBe('https://fixture.example:8443/api/auth/callback/dingtalk')
  expect(env.DINGTALK_CLIENT_ID).toBe(base.DINGTALK_APP_KEY)
  expect(env.DINGTALK_CLIENT_SECRET).toBe(base.DINGTALK_APP_SECRET)
  expect(env.DINGTALK_CORP_ID).toBe(base.DINGTALK_CORP_ID)
  expect(env.DINGTALK_AGENT_ID).toBe(base.DINGTALK_AGENT_ID)
  expect(env.DINGTALK_NOTIFICATIONS_ENABLED).toBe(false)
})

it('显式非空新配置优先，空模板值回退旧配置', () => {
  expect(parseEnv({ ...base, DINGTALK_CLIENT_ID: ' ', DINGTALK_CLIENT_SECRET: '' }).DINGTALK_CLIENT_ID).toBe('legacy-key')
  const env = parseEnv({ ...base, WEB_ORIGIN: 'https://new.example', DINGTALK_CLIENT_ID: 'new-key',
    DINGTALK_CLIENT_SECRET: 'new-secret', DINGTALK_REDIRECT_URI: 'https://new.example/api/auth/dingtalk/callback' })
  expect(env.WEB_ORIGIN).toBe('https://new.example')
  expect(env.DINGTALK_CLIENT_ID).toBe('new-key')
  expect(env.DINGTALK_CLIENT_SECRET).toBe('new-secret')
  expect(env.DINGTALK_REDIRECT_URI).toBe('https://new.example/api/auth/dingtalk/callback')
})

it('旧变量不能绕过生产HTTPS、origin和凭据检查，错误不泄漏密钥', () => {
  for (const NEXTAUTH_URL of ['http://fixture.example', 'https://fixture.example/path', 'invalid']) {
    expect(() => parseEnv({ ...base, NEXTAUTH_URL })).toThrow(/WEB_ORIGIN/)
  }
  expect(() => parseEnv({ ...base, DINGTALK_APP_SECRET: '', DINGTALK_NOTIFICATIONS_ENABLED: 'true' })).toThrow(/DINGTALK_NOTIFICATIONS_ENABLED/)
  try { parseEnv({ ...base, NEXTAUTH_URL: 'invalid' }) } catch (error) {
    expect(String(error)).not.toContain(base.DINGTALK_APP_SECRET)
  }
})
