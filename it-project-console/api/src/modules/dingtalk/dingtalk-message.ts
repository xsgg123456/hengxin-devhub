import type { DingTalkClient } from './dingtalk-client.js'

export type MessageClient = Pick<DingTalkClient, 'legacy'>
const base = '/topapi/message/corpconversation/'
export function boundedMessage(content: string) {
  if (Buffer.byteLength(content,'utf8') <= 1900) return content
  const last = content.split('\n').at(-1) ?? ''
  const tail = `\n…更多信息请打开详情\n${last}`
  const budget = Math.max(0,1900-Buffer.byteLength(tail,'utf8'))
  let body='', bytes=0
  for(const char of content) {
    const size=Buffer.byteLength(char,'utf8')
    if(bytes+size>budget) break
    body+=char;bytes+=size
  }
  return body+tail
}
export async function sendWorkMessage(client: MessageClient, agentId: string, userId: string, content: string) {
  const response = await client.legacy(`${base}asyncsend_v2`, {
    agent_id: agentId, userid_list: userId, to_all_user: false,
    msg: { msgtype: 'text', text: { content: boundedMessage(content) } }
  })
  const task = response.task_id
  if (!((typeof task === 'string' && /^\d+$/.test(task)) ||
    (typeof task === 'number' && Number.isSafeInteger(task) && task > 0)))
    throw new Error('工作通知受理回执无效')
  return String(task)
}
export async function workMessageResult(client: MessageClient, agentId: string, taskId: string, userId: string) {
  const response = await client.legacy(`${base}getsendresult`, { agent_id: agentId, task_id: taskId })
  const result = response.send_result
  if (!result || typeof result !== 'object' || Array.isArray(result)) return 'pending'
  const data = result as Record<string, unknown>
  const contains = (key: string) => Array.isArray(data[key]) && data[key].includes(userId)
  if (['failed_user_id_list', 'invalid_user_id_list', 'forbidden_user_id_list'].some(contains) ||
    (Array.isArray(data.forbidden_list) && data.forbidden_list.some(item =>
      item && typeof item === 'object' && 'userid' in item && item.userid === userId))) return 'failed'
  // Only a positive per-recipient receipt proves delivery; an empty result is not success.
  return contains('read_user_id_list') || contains('unread_user_id_list') ? 'sent' : 'pending'
}
