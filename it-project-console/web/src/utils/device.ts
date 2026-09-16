export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent)
}

export function isSupportedDevice(): boolean {
  if (typeof window === 'undefined') return true

  const { userAgent, maxTouchPoints = 0 } = window.navigator
  // iPadOS may identify as Macintosh; touch-enabled Windows desktops remain supported.
  const desktopModeIPad = /Macintosh/i.test(userAgent) && maxTouchPoints > 1
  return !isMobileUserAgent(userAgent) && !desktopModeIPad
}
