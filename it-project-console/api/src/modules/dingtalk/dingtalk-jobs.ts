import type { FastifyBaseLogger } from 'fastify'
import type { DingtalkDirectory } from './dingtalk-directory.js'
import type { NotificationService } from '../notifications/notification-service.js'
import { flushNotifications } from '../notifications/notification-job.js'
export function startDingTalkJobs(directory: DingtalkDirectory, notifications: NotificationService,
  syncEnabled: boolean, log: FastifyBaseLogger) {
  let sync: Promise<void> | undefined, delivery: Promise<void> | undefined, stopped = false
  const syncDirectory = () => {
    if (stopped || !syncEnabled || sync) return
    sync = (async () => {
      try {
        const result = await directory.sync()
        if (result.managerMissing) log.warn({code:'DINGTALK_MANAGER_MISSING'},'组织同步后无有效管理员，请检查初始化配置')
      } catch { log.error({code:'DINGTALK_DIRECTORY_FAILED'},'钉钉组织同步失败，保留上次完整快照') }
      finally { sync = undefined }
    })()
  }
  const flush = () => {
    if (stopped || delivery) return
    delivery = (async () => {
      const result = await flushNotifications(notifications)
      if (!result.ok) log.error({code:'DINGTALK_DELIVERY_FAILED'},result.error)
      delivery = undefined
    })()
  }
  const syncTimer = setInterval(syncDirectory, 15*60*1000), deliveryTimer = setInterval(flush,60000)
  syncTimer.unref(); deliveryTimer.unref(); syncDirectory()
  return async () => {
    stopped=true;clearInterval(syncTimer);clearInterval(deliveryTimer)
    await Promise.allSettled([sync,delivery].filter((task):task is Promise<void>=>Boolean(task)))
  }
}
