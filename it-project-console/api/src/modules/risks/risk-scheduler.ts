import cron from 'node-cron'
export function startRiskScheduler(
  scan: () => Promise<unknown>,
  expression: string,
  log: { error(message: string): void }
) {
  let running: Promise<void> | undefined
  const run = () => {
    if (running) return running
    running = scan()
      .then(
        () => {},
        () => log.error('风险扫描失败，下次周期重试')
      )
      .finally(() => {
        running = undefined
      })
    return running
  }
  const task = cron.schedule(expression, run, {
    timezone: 'Asia/Shanghai',
    noOverlap: true,
    name: 'project-risk-scan',
    unref: true
  })
  void run()
  return async () => {
    await task.destroy()
    await running
  }
}
