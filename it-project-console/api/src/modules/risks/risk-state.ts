/** Daily counters are display values, not a new alert state. Blocker detail stays significant. */
export function riskState(value: unknown): string {
  const risks = Array.isArray(value) ? value.filter((r):r is string=>typeof r==='string') : []
  return JSON.stringify(risks.map(r=>r
    .replace(/^(环节延期|项目延期) \d+ 天(（等待业务确认）)?$/, '$1$2')
    .replace(/^验收等待 \d+ 个工作日：等待业务确认$/, '验收等待：等待业务确认')
    .replace(/^已有 \d+ 个工作日未更新整体进度$/, '整体进度停更')
    .replace(/^有风险：交付计划较原定晚 \d+ 天$/, '交付计划推迟')).sort())
}
