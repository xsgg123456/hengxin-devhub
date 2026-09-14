import { DingTalkError, type DingTalkClient } from './dingtalk-client.js'
import { boundedMessage } from './dingtalk-message.js'

export type RobotClient = Pick<DingTalkClient, 'robot'>

// One recipient per outbox: a batch-level acceptance must never hide a rejected employee.
export async function sendRobotMessage(client: RobotClient, robotCode: string, userId: string, content: string) {
  const response = await client.robot('batchSend', {
    robotCode, userIds: [userId], msgKey: 'sampleText',
    msgParam: JSON.stringify({ content: boundedMessage(content) })
  })
  for (const key of ['invalidStaffIdList', 'flowControlledStaffIdList']) {
    const value = response[key]
    if (value !== undefined && (!Array.isArray(value) || value.some(id => typeof id !== 'string')))
      throw new DingTalkError(false, true)
  }
  if ((response.invalidStaffIdList as string[] | undefined)?.includes(userId)) throw new DingTalkError(false, false)
  if ((response.flowControlledStaffIdList as string[] | undefined)?.includes(userId)) throw new DingTalkError(true, false)
  if (typeof response.processQueryKey !== 'string' || !response.processQueryKey.trim()) throw new DingTalkError(false, true)
  return response.processQueryKey
}

export async function robotMessageResult(client: RobotClient, robotCode: string, processQueryKey: string, userId: string) {
  const response = await client.robot('readStatus', { robotCode, processQueryKey })
  // This is a read-status API, not the work-notification send-result API.
  // Only an explicit read by our recipient proves delivery. Unread/unknown never cause a resend.
  const rows = response.messageReadInfoList
  if (!Array.isArray(rows)) return 'pending'
  const recipient = rows.find(row => row && typeof row === 'object' && row.userId === userId)
  return recipient?.readStatus === 'read' ? 'sent' : 'pending'
}
