import { expect, it, vi } from 'vitest'
import { DingTalkClient } from './dingtalk-client.js'
import { boundedMessage, sendWorkMessage, workMessageResult } from './dingtalk-message.js'

it('工作通知通过legacy客户端发送，task_id只代表受理', async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ accessToken: 'fixture', expireIn: 7200 }))
    .mockResolvedValueOnce(Response.json({ errcode: 0, task_id: 123 }))
  const client = new DingTalkClient({ clientId: 'fixture', clientSecret: 'fixture' }, fetcher)
  expect(await sendWorkMessage(client, '1', 'fixture-user', '项目风险')).toBe('123')
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).toEqual({
    agent_id: '1', userid_list: 'fixture-user', to_all_user: false,
    msg: { msgtype: 'text', text: { content: '项目风险' } }
  })
})
it('结果为空继续等待；目标读/未读名单确认送达，失败名单优先', async () => {
  const legacy = vi.fn().mockResolvedValueOnce({ send_result: {} })
    .mockResolvedValueOnce({ send_result: { unread_user_id_list: ['u'] } })
    .mockResolvedValueOnce({ send_result: { read_user_id_list: ['other'] } })
    .mockResolvedValueOnce({ send_result: { failed_user_id_list: ['u'], read_user_id_list: ['u'] } })
  const results = []
  for (let i = 0; i < 4; i++) results.push(await workMessageResult({ legacy }, '1', '2', 'u'))
  expect(results).toEqual(['pending', 'sent', 'pending', 'failed'])
})
it('无有效task_id不假标受理', async () => {
  await expect(sendWorkMessage({ legacy: vi.fn().mockResolvedValue({}) }, '1', 'u', '内容')).rejects.toThrow()
})
it('长中文通知控制字节数并保留详情深链', () => {
  const url = 'https://example.test/#/project-overview?projectId=fixture'
  const content = boundedMessage(`${'项目风险说明'.repeat(500)}\n${url}`)
  expect(Buffer.byteLength(content, 'utf8')).toBeLessThanOrEqual(1900)
  expect(content.endsWith(url)).toBe(true)
  expect(content).toContain('更多信息请打开详情')
})
