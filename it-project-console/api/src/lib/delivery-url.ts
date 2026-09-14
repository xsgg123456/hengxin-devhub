// Delivery addresses may belong to an intranet. Never probe them from the server.
export function deliveryHref(input: string): string | null {
  const value = input.trim()
  if (!value) return ''
  if (value.length > 2000 || /[\u0000-\u0020\u007f\\]/.test(value)) return null
  let candidate = value
  if (!/^https?:\/\//i.test(value)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[^/?#:\s]+:\d+(?:[/?#]|$)/.test(value)) return null
    if (/^[/?#]/.test(value)) return null
    candidate = 'http://' + value
  }
  try {
    const parsed = new URL(candidate)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password
      ? parsed.href : null
  } catch { return null }
}
