import { expect, it, vi } from 'vitest'
import { DingTalkClient } from './dingtalk-client.js'
import { robotMessageResult, sendRobotMessage } from './dingtalk-robot-message.js'

it('机器人单聊使用员工ID、官方端点和header token，查询使用GET且正确编码', async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ accessToken: 'fixture-token', expireIn: 7200 }))
    .mockResolvedValueOnce(Response.json({ processQueryKey: 'key+/=', invalidStaffIdList: [], flowControlledStaffIdList: [] }))
    .mockResolvedValueOnce(Response.json({ messageReadInfoList: [{ userId: 'u', readStatus: 'read' }] }))
  const client = new DingTalkClient({ clientId: 'app', clientSecret: 'fixture-secret' }, fetcher)
  expect(await sendRobotMessage(client, 'bot', 'u', '项目\nhttps://example.test/#/')).toBe('key+/=')
  expect(await robotMessageResult(client, 'bot', 'key+/=', 'u')).toBe('sent')
  const [url, options] = fetcher.mock.calls[1]!
  expect(String(url)).toBe('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend')
  expect(options!.headers).toMatchObject({ 'x-acs-dingtalk-access-token': 'fixture-token' })
  expect(JSON.parse(String(options!.body))).toEqual({ robotCode: 'bot', userIds: ['u'], msgKey: 'sampleText',
    msgParam: JSON.stringify({ content: '项目\nhttps://example.test/#/' }) })
  const [query, queryOptions] = fetcher.mock.calls[2]!
  expect(new URL(String(query)).searchParams.get('processQueryKey')).toBe('key+/=')
  expect(queryOptions!.method).toBe('GET')
  expect(queryOptions!.body).toBeUndefined()
  expect(fetcher).toHaveBeenCalledTimes(3)
})

it.each([
  [{ invalidStaffIdList: ['u'], processQueryKey: 'k' }, false, false],
  [{ flowControlledStaffIdList: ['u'], processQueryKey: 'k' }, true, false],
  [{}, false, true],
  [{ processQueryKey: ' ', invalidStaffIdList: [] }, false, true],
  [{ processQueryKey: 'k', invalidStaffIdList: 'u' }, false, true]
])('拒绝无效收件人、限流和不确定回执：%j', async (response, retryable, uncertain) => {
  await expect(sendRobotMessage({ robot: vi.fn().mockResolvedValue(response) }, 'b', 'u', '内容'))
    .rejects.toMatchObject({ retryable, uncertain })
})

it('未读、空结果及其他人的已读不会伪装为目标已读，也不触发重发', async () => {
  for (const response of [{}, { messageReadInfoList: [{ userId: 'u', readStatus: 'unread' }] },
    { messageReadInfoList: [{ userId: 'other', readStatus: 'read' }] }]) {
    expect(await robotMessageResult({ robot: vi.fn().mockResolvedValue(response) }, 'b', 'k', 'u')).toBe('pending')
  }
})

it('发送超时不确定、token失败未发送、权限拒绝和限流均脱敏', async () => {
  for (const [response, retryable, uncertain] of [[Response.json({ code: 'Forbidden', message: 'secret' }, { status: 403 }), false, false],
    [Response.json({ code: 'Throttled' }, { status: 429 }), true, false],
    [Response.json({ code: 'system.error' }, { status: 500 }), true, true]] as const) {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ accessToken: 'token', expireIn: 7200 })).mockResolvedValueOnce(response)
    await expect(sendRobotMessage(new DingTalkClient({ clientId: 'a', clientSecret: 's' }, fetcher), 'b', 'u', '内容'))
      .rejects.toMatchObject({ retryable, uncertain })
  }
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ accessToken: 'token', expireIn: 7200 })).mockRejectedValueOnce(new Error('secret'))
  await expect(sendRobotMessage(new DingTalkClient({ clientId: 'a', clientSecret: 's' }, fetcher), 'b', 'u', '内容'))
    .rejects.toMatchObject({ uncertain: true })
  const tokenFailure = vi.fn().mockRejectedValue(new Error('secret'))
  await expect(sendRobotMessage(new DingTalkClient({ clientId: 'a', clientSecret: 's' }, tokenFailure), 'b', 'u', '内容'))
    .rejects.toMatchObject({ uncertain: false, retryable: true })
  expect(tokenFailure).toHaveBeenCalledTimes(1)
})

it.each(['send.byToken.tooFast', 'send.too.fast', 'too.many.group', 'too.many.people'])('HTTP400明确限流可安全退避：%s', async code => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ accessToken: 'token', expireIn: 7200 }))
    .mockResolvedValueOnce(Response.json({ code }, { status: 400 }))
  await expect(sendRobotMessage(new DingTalkClient({ clientId: 'a', clientSecret: 's' }, fetcher), 'b', 'u', '内容'))
    .rejects.toMatchObject({ retryable: true, uncertain: false })
})
