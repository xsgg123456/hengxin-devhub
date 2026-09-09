import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import { authService, requireManager } from '../../plugins/auth.js'
import { DingTalkClient } from './dingtalk-client.js'
import { DingtalkDirectory } from './dingtalk-directory.js'

const cookieName = 'itpc_ding_state'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export function supportedDesktop(userAgent = '') {
  return !/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent)
}
export function safeReturnTo(value: unknown) {
  return typeof value === 'string' && /^\/#\/[A-Za-z0-9/?=&%_.~-]*$/.test(value) && value.length <= 2000
    ? value : '/#/'
}
export function dingConfigured(env: Env) {
  return Boolean(env.DINGTALK_CLIENT_ID && env.DINGTALK_CLIENT_SECRET && env.DINGTALK_CORP_ID && env.DINGTALK_REDIRECT_URI)
}
export function registerDingTalkAuth(app: FastifyInstance, db: PrismaClient, env: Env,
  client = new DingTalkClient({clientId:env.DINGTALK_CLIENT_ID,clientSecret:env.DINGTALK_CLIENT_SECRET})) {
  const auth = authService(db, env)
  const directory = new DingtalkDirectory(db, client, {corpId:env.DINGTALK_CORP_ID,bootstrapAdminId:env.BOOTSTRAP_ADMIN_DING_USER_ID})
  const configured = () => {
    if (!dingConfigured(env)) throw new AppError(503, 'DINGTALK_NOT_CONFIGURED', '钉钉登录尚未配置，请联系管理员')
  }
  const cookieOptions = {httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'lax' as const,path:'/api/auth'}
  app.get('/api/auth/dingtalk/config', async (_, reply) => {
    reply.header('cache-control','no-store')
    return {data:{enabled:dingConfigured(env),clientId:env.DINGTALK_CLIENT_ID,corpId:env.DINGTALK_CORP_ID}}
  })
  app.get('/api/auth/dingtalk/start', {config:{rateLimit:{max:10,timeWindow:'1 minute'}}}, async (request, reply) => {
    configured()
    const {returnTo} = z.object({returnTo:z.string().optional()}).parse(request.query)
    const state = randomBytes(32).toString('hex'), expiresAt = new Date(Date.now()+300000)
    await db.authChallenge.deleteMany({where:{expiresAt:{lt:new Date()}}})
    await db.authChallenge.create({data:{id:hash(state),returnTo:safeReturnTo(returnTo),expiresAt}})
    reply.setCookie(cookieName,state,{...cookieOptions,expires:expiresAt})
    const url = new URL('https://login.dingtalk.com/oauth2/auth')
    url.search = new URLSearchParams({client_id:env.DINGTALK_CLIENT_ID,redirect_uri:env.DINGTALK_REDIRECT_URI,
      response_type:'code',scope:'openid',state,prompt:'consent'}).toString()
    return reply.header('cache-control','no-store').redirect(url.toString())
  })
  const callback = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('cache-control','no-store').header('referrer-policy','no-referrer')
    reply.clearCookie(cookieName,cookieOptions)
    try {
      configured()
      const query = z.object({state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().min(1).max(2048).optional(),authCode:z.string().min(1).max(2048).optional()}).parse(request.query)
      if (request.cookies[cookieName] !== query.state) throw new Error('Invalid state')
      const challenge = await db.$transaction(async tx => {
        const row = await tx.authChallenge.findUnique({where:{id:hash(query.state)}})
        const consumed = await tx.authChallenge.deleteMany({where:{id:hash(query.state),expiresAt:{gt:new Date()}}})
        if (!row || consumed.count !== 1) throw new Error('Expired state')
        return row
      })
      const code = query.authCode ?? query.code
      if (!code) throw new Error('Missing code')
      const user = await directory.resolve(await client.oauth(code))
      await auth.login(user.id,request,reply)
      return reply.redirect(env.WEB_ORIGIN+challenge.returnTo)
    } catch {
      // Never reflect provider errors, codes or state into the page or logs.
      return reply.redirect(env.WEB_ORIGIN+'/#/auth/login?dingError=authorization_failed')
    }
  }
  for (const path of ['/api/auth/callback/dingtalk', '/api/auth/dingtalk/callback']) {
    app.get(path, {config:{rateLimit:{max:20,timeWindow:'1 minute'}}}, callback)
  }
  app.post('/api/auth/dingtalk/h5', {config:{rateLimit:{max:10,timeWindow:'1 minute'}}}, async (request,reply) => {
    configured()
    const {code} = z.object({code:z.string().min(1).max(2048)}).strict().parse(request.body)
    const user = await directory.resolve(await client.h5(code))
    return {data:await auth.login(user.id,request,reply)}
  })
  app.post('/api/admin/dingtalk/sync', {preHandler:[auth.authenticate,requireManager],config:{rateLimit:{max:2,timeWindow:'1 minute'}}}, async request => {
    configured()
    return {data:await directory.sync(request.actor!.id)}
  })
  return directory
}
