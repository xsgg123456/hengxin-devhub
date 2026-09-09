import { startRiskScheduler } from './modules/risks/risk-scheduler.js'
import { parseEnv } from './config/env.js'
import { buildApp } from './app.js'
import { runAttachmentCleanup } from './maintenance.js'
import { startDingTalkJobs } from './modules/dingtalk/dingtalk-jobs.js'
import { NotificationService } from './modules/notifications/notification-service.js'

const env = parseEnv(process.env)
const { app, attachments, scanRisks, directory, dingClient, db } = await buildApp(env)
const stopRisks = startRiskScheduler(scanRisks, env.RISK_SCAN_CRON, app.log)
const notifications = new NotificationService(db,dingClient,{agentId:env.DINGTALK_AGENT_ID,webOrigin:env.WEB_ORIGIN,enabled:env.DINGTALK_NOTIFICATIONS_ENABLED,managerDigestTime:env.DINGTALK_MANAGER_DIGEST_TIME})
const stopDingTalk = startDingTalkJobs(directory,notifications,Boolean(env.DINGTALK_CLIENT_ID&&env.DINGTALK_CLIENT_SECRET&&env.DINGTALK_CORP_ID),app.log)
let cleaning = false
const timer = setInterval(async () => {
  if (cleaning) return
  cleaning = true
  try {
    await runAttachmentCleanup(attachments, app.log)
  } finally {
    cleaning = false
  }
}, 60000)
timer.unref()
app.addHook('preClose', async () => {
  clearInterval(timer)
  await stopDingTalk()
  await stopRisks()
})
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    await app.close()
  })
}
await app.listen({ port: env.PORT, host: env.HOST })
