import { describe, expect, it, vi } from 'vitest'
import { DingTalkClient, DingTalkError } from './dingtalk-client.js'
import { safeReturnTo, supportedDesktop } from './dingtalk-auth.js'
const json = (body: unknown, status=200) => new Response(JSON.stringify(body),{status})
const staff = {userid:'employee',unionid:'union',name:'工程师',dept_id_list:[1],active:true}
describe('迁移钉钉传输与身份交换', () => {
  it('复用Token缓存，扫码openId必须映射企业userid且核验unionId', async () => {
    const mock=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({accessToken:'user-token'}))
      .mockResolvedValueOnce(json({openId:'not-staff-id',unionId:'union'}))
      .mockResolvedValueOnce(json({accessToken:'app-token',expireIn:7200}))
      .mockResolvedValueOnce(json({errcode:0,result:{userid:'employee'}}))
      .mockResolvedValueOnce(json({errcode:0,result:staff}))
      .mockResolvedValueOnce(json({errcode:0,result:staff}))
    const client=new DingTalkClient({clientId:'client',clientSecret:'secret'},mock)
    expect(await client.oauth('code')).toMatchObject({userId:'employee',unionId:'union'})
    await client.staff('employee')
    expect(mock.mock.calls.filter(([url])=>String(url).endsWith('/oauth2/accessToken'))).toHaveLength(1)
    expect(JSON.parse(String(mock.mock.calls[4]![1]!.body))).toMatchObject({userid:'employee'})
  })
  it('错误响应脱敏，超时未知投递与明确远端拒绝分离', async () => {
    const denied=new DingTalkClient({clientId:'c',clientSecret:'secret'},vi.fn().mockResolvedValue(json({errcode:40013,errmsg:'secret app-token'})))
    await expect(denied.legacy('/topapi/v2/user/get',{})).rejects.toMatchObject({uncertain:false})
    const network=new DingTalkClient({clientId:'c',clientSecret:'secret'},vi.fn().mockRejectedValue(new Error('sensitive-token')))
    try {await network.h5('c')} catch(error) {
      expect(error).toBeInstanceOf(DingTalkError);expect(error).toMatchObject({uncertain:false,retryable:true})
      expect(String(error)).not.toMatch(/secret|token/)
    }
    const sendNetwork = new DingTalkClient({clientId:'c',clientSecret:'s'},vi.fn()
      .mockResolvedValueOnce(json({accessToken:'app',expireIn:7200})).mockRejectedValueOnce(new Error('timeout')))
    await expect(sendNetwork.legacy('/topapi/message/corpconversation/asyncsend_v2',{})).rejects.toMatchObject({uncertain:true})
  })
  it('拒绝与扫码union不一致的企业身份', async () => {
    const values=[{accessToken:'user'},{unionId:'union'},{accessToken:'app',expireIn:7200},{result:{userid:'employee'}},{result:{...staff,unionid:'other'}}]
    const client=new DingTalkClient({clientId:'c',clientSecret:'s'},vi.fn().mockImplementation(async()=>json(values.shift())))
    await expect(client.oauth('code')).rejects.toMatchObject({statusCode:403})
  })
  it('拒绝外部回跳与手机访问，允许桌面钉钉', () => {
    expect(safeReturnTo('https://evil.example')).toBe('/#/')
    expect(safeReturnTo('//evil.example')).toBe('/#/')
    expect(safeReturnTo('/#/project-overview?projectId=abc')).toContain('projectId=abc')
    expect(supportedDesktop('Windows NT DingTalk')).toBe(true)
    expect(supportedDesktop('iPhone DingTalk')).toBe(false)
    expect(supportedDesktop('Android')).toBe(false)
  })
})
