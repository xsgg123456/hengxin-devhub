import { parseEnv } from './config/env.js'
import { buildApp } from './app.js'
import { runAttachmentCleanup } from './maintenance.js'

const env = parseEnv(process.env)
const { app, attachments } = await buildApp(env)
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
app.addHook('onClose', async () => {
  clearInterval(timer)
})
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    await app.close()
  })
}
await app.listen({ port: env.PORT, host: env.HOST })
