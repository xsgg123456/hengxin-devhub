/** Compare calendar dates, not elapsed local hours; missing historical baselines are unknown. */
export function approvedLaunchOverrun(approved?: string | null, expected?: string | null): number {
  const parse = (value?: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
    const stamp = Date.parse(`${value}T00:00:00Z`)
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value
      ? stamp
      : NaN
  }
  const days = (parse(expected) - parse(approved)) / 86400000
  return Number.isFinite(days) ? Math.max(0, days) : 0
}
