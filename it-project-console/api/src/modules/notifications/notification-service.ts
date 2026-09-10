import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import { DingTalkError } from '../dingtalk/dingtalk-client.js'
import { sendWorkMessage, workMessageResult, type MessageClient } from '../dingtalk/dingtalk-message.js'
import { prepareManagerRiskDigest } from './manager-risk-digest.js'

const supported = new Set(['MANAGER_RISK_DIGEST', 'PROJECT_RISKS_CHANGED', 'DEMAND_RETURNED', 'DEMAND_APPROVED', 'PROJECT_ASSIGNED', 'PROJECT_COMPLETED'])
const samples = new Set(['user-manager-chen', 'user-business-li', 'user-engineer-wang', 'user-engineer-zhao'])
const include = { recipient: true, demand: true, project: { include: { primaryOwner: true } }, deliveryLog: true } as const
type Item = Prisma.NotificationOutboxGetPayload<{ include: typeof include }>
type State = 'ACCEPTED' | 'SENT' | 'RETRY' | 'FAILED' | 'UNKNOWN' | 'SKIPPED'
export type NotificationOptions = { agentId: string; webOrigin: string; enabled: boolean; managerDigestTime?: string }
export type NotificationOutcome = { accepted: number; sent: number; failed: number; skipped: number; unknown: number }

export function notificationContent(item: Item, origin: string) {
  const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload) ? item.payload : {}
  if (item.eventType === 'MANAGER_RISK_DIGEST') {
    const projects = Array.isArray(payload.projects) ? payload.projects : []
    const blocks = projects.flatMap(project => {
      if (!project || typeof project !== 'object' || Array.isArray(project) || typeof project.projectId !== 'string') return []
      return [[`项目：${project.name}`, `负责人：${project.owner}`,
        ...(Array.isArray(project.risks) ? project.risks.filter(risk => typeof risk === 'string') : []),
        `查看详情：${new URL(`/#/project-overview?projectId=${encodeURIComponent(project.projectId)}`, origin).href}`].join('\n')]
    })
    const overview = `查看全部：${new URL('/#/project-overview', origin).href}`
    const reserve = Buffer.byteLength(`\n其余 ${blocks.length} 个项目请点总览\n${overview}`, 'utf8')
    let content = '项目风险汇总', shown = 0
    for (const block of blocks) {
      if (Buffer.byteLength(`${content}\n${block}`, 'utf8') + reserve > 1800) break
      content += `\n${block}`
      shown++
    }
    return shown < blocks.length ? `${content}\n其余 ${blocks.length - shown} 个项目请点总览\n${overview}` : content
  }
  const title: Record<string, string> = {
    PROJECT_RISKS_CHANGED: '项目风险提醒', DEMAND_RETURNED: '需求已退回',
    DEMAND_APPROVED: '需求已正式立项', PROJECT_ASSIGNED: '项目已分配', PROJECT_COMPLETED: '项目已完成'
  }
  const risks = Array.isArray(payload.risks) ? payload.risks.filter((risk): risk is string =>
    typeof risk === 'string' && (item.recipient.role === 'MANAGER' || /临期|延期|未更新|阻塞/.test(risk))) : []
  const path = item.projectId ? `/#/project-overview?projectId=${encodeURIComponent(item.projectId)}` :
    `/#/my-demands?demandId=${encodeURIComponent(item.demandId ?? '')}`
  return [title[item.eventType], `项目：${item.project?.name ?? item.demand?.name ?? '需求'}`,
    item.project ? `负责人：${item.project.primaryOwner.name}` : '', ...risks,
    typeof payload.reason === 'string' ? `原因：${payload.reason}` : '',
    `查看详情：${new URL(path, origin).href}`].filter(Boolean).join('\n')
}

export class NotificationService {
  constructor(private readonly db: PrismaClient, private readonly client: MessageClient, private readonly options: NotificationOptions) {}

  private async claim(now: Date) {
    return this.db.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>
        `SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0)) AS acquired`
      if (!lock?.acquired) return []
      const items = await tx.notificationOutbox.findMany({
        where: { status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: now },
          NOT: { eventType: 'PROJECT_RISKS_CHANGED', recipient: { role: 'MANAGER' }, deliveryLog: null },
          OR: [{ deliveryLog: null }, { deliveryLog: { state: { in: ['ACCEPTED', 'POLLING', 'SENDING', 'CLAIMED', 'RETRY'] } } }] },
        include, orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }], take: 5
      })
      for (const item of items) {
        await tx.notificationLog.upsert({ where: { outboxId: item.id },
          create: { outboxId: item.id, state: 'CLAIMED' },
          update: { state: item.deliveryLog?.taskId ? 'POLLING' : item.deliveryLog?.state === 'SENDING' ? 'SENDING' : 'CLAIMED' } })
        // A CLAIMED lease is safe to cancel; SENDING is persisted separately before external I/O.
        await tx.notificationOutbox.update({ where: { id: item.id }, data: { availableAt: new Date(now.getTime() + 5 * 60_000) } })
      }
      return items
    })
  }

  private async record(tx: Prisma.TransactionClient, item: Item, state: State, now: Date, safeError: string | null = null, taskId?: string) {
    const retry = state === 'RETRY'
    const terminal = ['FAILED', 'UNKNOWN', 'SKIPPED'].includes(state)
    {
      await tx.notificationLog.update({ where: { outboxId: item.id }, data: {
        state, safeError, ...(taskId !== undefined ? { taskId } : {}),
        ...(retry ? { taskId: null } : {}), ...(state === 'SENT' ? { sentAt: now } : {})
      } })
      await tx.notificationOutbox.update({ where: { id: item.id }, data: {
        status: state === 'SENT' ? 'SENT' : retry || terminal ? 'FAILED' : 'PENDING',
        availableAt: new Date(now.getTime() + (retry ? Math.min(60, 2 ** item.attempts) : 1) * 60_000)
      } })
    }
  }

  private skip(item: Item) {
    const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload) ? item.payload : {}
    return (item.eventType !== 'MANAGER_RISK_DIGEST' && !item.projectId && !item.demandId) ||
      (item.eventType === 'MANAGER_RISK_DIGEST' && (!Array.isArray(payload.projects) || payload.projects.length === 0)) ||
      !supported.has(item.eventType) || !item.recipient.active || !item.recipient.dingUserId ||
      (item.eventType === 'MANAGER_RISK_DIGEST' && item.recipient.role !== 'MANAGER') ||
      (item.eventType === 'PROJECT_RISKS_CHANGED' && item.recipient.role !== 'MANAGER' &&
        !(item.recipient.role === 'ENGINEER' && item.project?.primaryOwnerId === item.recipientId)) ||
      samples.has(item.recipientId) || item.projectId === 'project-demo' || item.demandId === 'demand-demo-owned'
      || [item.recipientId,item.projectId,item.demandId].some(id=>id?.startsWith('sample-'))
  }

  async flush(now = new Date()): Promise<NotificationOutcome> {
    const outcome = { accepted: 0, sent: 0, failed: 0, skipped: 0, unknown: 0 }
    if (!this.options.enabled) return outcome
    if (!/^\d+$/.test(this.options.agentId) || !/^https?:$/.test(new URL(this.options.webOrigin).protocol))
      throw new Error('钉钉工作通知配置无效')
    await prepareManagerRiskDigest(this.db, now, this.options.managerDigestTime)
    for (const claimed of await this.claim(now)) {
      // Serialize one external operation and its receipt with deletion, then release
      // the lock so a batch cannot hold deletion behind five network requests.
      await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notification-flush', 0))::text`
        const item = await tx.notificationOutbox.findUnique({ where: { id: claimed.id }, include })
        if (!item || item.status === 'SENT' || !['CLAIMED', 'SENDING', 'POLLING'].includes(item.deliveryLog?.state ?? '')) {
          outcome.skipped++
          return
        }

        const taskId = item.deliveryLog?.taskId
        if (taskId) {
          try {
            const result = await workMessageResult(this.client, this.options.agentId, taskId, item.recipient.dingUserId!)
            if (result === 'sent') { await this.record(tx, item, 'SENT', now); outcome.sent++ }
            else if (result === 'failed') {
              await this.record(tx, item, item.attempts < 5 ? 'RETRY' : 'FAILED', now, '钉钉确认收件人投递失败')
              outcome.failed++
            } else await this.pendingReceipt(tx, item, now, outcome)
          } catch { await this.pendingReceipt(tx, item, now, outcome) }
          return
        }
        if (item.deliveryLog?.state === 'SENDING' || item.attempts >= 5) {
          await this.record(tx, item, item.attempts >= 5 ? 'FAILED' : 'UNKNOWN', now, '投递结果待人工核查')
          outcome.unknown++
          return
        }
        if (this.skip(item)) {
          await this.record(tx, item, 'SKIPPED', now, '目标停用、未绑定、样例数据或事件不支持')
          outcome.skipped++
          return
        }
        // Commit the sending marker independently while holding the advisory lock.
        // The outer transaction has not written/locked these rows, avoiding self-deadlock.
        // If receipt persistence rolls back after external acceptance, SENDING survives.
        await this.db.$transaction(async sendingTx => {
          await sendingTx.notificationLog.update({ where: { outboxId: item.id }, data: { state: 'SENDING' } })
          await sendingTx.notificationOutbox.update({ where: { id: item.id }, data: { attempts: { increment: 1 } } })
        })
        item.attempts++
        let receipt: string
        try { receipt = await sendWorkMessage(this.client, this.options.agentId, item.recipient.dingUserId!, notificationContent(item, this.options.webOrigin)) }
        catch (error) {
          const known = error instanceof DingTalkError && !error.uncertain
          const state = known ? error.retryable && item.attempts < 5 ? 'RETRY' : 'FAILED' : 'UNKNOWN'
          await this.record(tx, item, state, now, known ? '钉钉拒绝投递' : '投递结果待人工核查')
          if (state === 'UNKNOWN') outcome.unknown++; else outcome.failed++
          return
        }
        // Keep this write outside the send catch: DB failure after acceptance must not trigger resend.
        await this.record(tx, item, 'ACCEPTED', now, null, receipt)
        outcome.accepted++
      }, { timeout: 60_000, maxWait: 10_000 })
    }
    return outcome
  }

  private async pendingReceipt(tx: Prisma.TransactionClient, item: Item, now: Date, outcome: NotificationOutcome) {
    if (now.getTime() - item.deliveryLog!.createdAt.getTime() >= 24 * 60 * 60_000) {
      await this.record(tx, item, 'UNKNOWN', now, '回执超过24小时未确认，待人工核查')
      outcome.unknown++
    } else { await this.record(tx, item, 'ACCEPTED', now, '等待钉钉送达回执'); outcome.accepted++ }
  }
}
