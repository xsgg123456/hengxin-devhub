import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { buildApp } from '../../app.js'
import { parseEnv } from '../../config/env.js'
import { createPrisma } from '../../plugins/prisma.js'
import { DingTalkClient } from './dingtalk-client.js'
const env = parseEnv(process.env)
if(env.NODE_ENV!=='test'||!new URL(env.DATABASE_URL).searchParams.get('schema')?.startsWith('itpc_test_')) throw new Error('必须使用隔离入口')
const db=createPrisma(env.DATABASE_URL),id='ding-auth-integration-user'
const identity={userId:'ding-auth-staff',unionId:'ding-auth-union',name:'钉钉测试员工',departmentIds:['ding-auth-dept'],active:true}
const client=new DingTalkClient({clientId:'test-client',clientSecret:'test-secret'},vi.fn().mockRejectedValue(new Error('禁止真实网络')))
vi.spyOn(client,'staff').mockResolvedValue(identity)
vi.spyOn(client,'oauth').mockResolvedValue(identity)
vi.spyOn(client,'h5').mockResolvedValue(identity)
let app:Awaited<ReturnType<typeof buildApp>>['app']
let previousSetting:unknown
beforeAll(async()=>{
  previousSetting=await db.systemSetting.findUnique({where:{key:'dingtalk.directory'}})
  await db.department.create({data:{id:'ding-auth-department',name:'信息技术部',dingDeptId:'ding-auth-dept'}})
  await db.user.create({data:{id,name:identity.name,department:'信息技术部',departmentId:'ding-auth-department',dingUserId:identity.userId,dingUnionId:identity.unionId,role:'ENGINEER'}})
  await db.systemSetting.upsert({where:{key:'dingtalk.directory'},create:{key:'dingtalk.directory',value:{corpId:'test-corp',userIds:[id]}},update:{value:{corpId:'test-corp',userIds:[id]}}})
  app=(await buildApp({...env,DINGTALK_CLIENT_ID:'test-client',DINGTALK_CLIENT_SECRET:'test-secret',DINGTALK_CORP_ID:'test-corp',DINGTALK_REDIRECT_URI:'http://127.0.0.1:4322/api/auth/callback/dingtalk'},{db,logging:false,dingClient:client})).app
  await app.ready()
})
afterAll(async()=>{
  await app?.close();await db.session.deleteMany({where:{userId:id}});await db.user.delete({where:{id}});await db.department.delete({where:{id:'ding-auth-department'}})
  const prior=previousSetting as {value:object}|null
  if(prior) await db.systemSetting.update({where:{key:'dingtalk.directory'},data:{value:prior.value}})
  else await db.systemSetting.deleteMany({where:{key:'dingtalk.directory'}})
  await db.authChallenge.deleteMany();await db.$disconnect()
})
async function start() {
  const result=await app.inject('/api/auth/dingtalk/start?returnTo='+encodeURIComponent('/#/project-overview?projectId=demo'))
  expect(result.statusCode).toBe(302)
  const state=new URL(result.headers.location!).searchParams.get('state')!
  expect(new URL(result.headers.location!).searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4322/api/auth/callback/dingtalk')
  const cookie=result.cookies.find(c=>c.name==='itpc_ding_state')!
  expect(cookie.path).toBe('/api/auth')
  return {state,cookie:`itpc_ding_state=${cookie.value}`}
}
const paths = ['/api/auth/callback/dingtalk', '/api/auth/dingtalk/callback']
it.each(paths)('扫码回调 %s 绑定Cookie并一次性消费state，真实创建服务端会话',async(path)=>{
  const {state,cookie}=await start()
  const callback=()=>app.inject({url:`${path}?state=${state}&code=temporary`,headers:{cookie}})
  const result=await callback()
  expect(result.headers.location).toBe(env.WEB_ORIGIN+'/#/project-overview?projectId=demo')
  expect(result.cookies.some(c=>c.name==='itpc_session'&&c.value)).toBe(true)
  expect((await callback()).headers.location).toContain('authorization_failed')
  const otherPath = paths.find(candidate => candidate !== path)!
  expect((await app.inject({url:`${otherPath}?state=${state}&code=temporary`,headers:{cookie}})).headers.location).toContain('authorization_failed')
  expect(await db.authChallenge.count({where:{id:createHash('sha256').update(state).digest('hex')}})).toBe(0)
})
it.each(paths)('回调 %s 的错误Cookie、过期state和停用用户都不能取得登录会话',async(path)=>{
  const {state,cookie}=await start()
  const invalid=await app.inject(`${path}?state=${state}&code=x`)
  expect(invalid.cookies.some(c=>c.name==='itpc_session')).toBe(false)
  await db.authChallenge.update({where:{id:createHash('sha256').update(state).digest('hex')},data:{expiresAt:new Date(0)}})
  expect((await app.inject({url:`${path}?state=${state}&code=x`,headers:{cookie}})).headers.location).toContain('authorization_failed')
  await db.user.update({where:{id},data:{active:false}})
  const denied=await app.inject({method:'POST',url:'/api/auth/dingtalk/h5',headers:{origin:env.WEB_ORIGIN},payload:{code:'code'}})
  expect(denied.statusCode).toBe(403);expect(denied.cookies.some(c=>c.name==='itpc_session')).toBe(false)
  await db.user.update({where:{id},data:{active:true}})
})
it('桌面免登与会话可用，手机即使携带有效cookie仍不能加载业务',async()=>{
  const result=await app.inject({method:'POST',url:'/api/auth/dingtalk/h5',headers:{origin:env.WEB_ORIGIN,'user-agent':'Windows DingTalk'},payload:{code:'code'}})
  expect(result.statusCode).toBe(200)
  const cookie=result.cookies.find(c=>c.name==='itpc_session')!
  expect((await app.inject({url:'/api/me',headers:{cookie:`itpc_session=${cookie.value}`}})).json().data.role).toBe('ENGINEER')
  for(const url of ['/api/workspace','/api/me','/api/dashboard']) expect((await app.inject({url,headers:{cookie:`itpc_session=${cookie.value}`,'user-agent':'iPhone DingTalk'}})).statusCode).toBe(403)
  expect((await app.inject({method:'POST',url:'/api/auth/dingtalk/h5',headers:{origin:'https://evil.example'},payload:{code:'code'}})).statusCode).toBe(403)
  const config=await app.inject('/api/auth/dingtalk/config')
  expect(config.body).not.toContain('test-secret')
})
