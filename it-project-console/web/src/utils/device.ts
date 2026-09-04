export const MIN_DESKTOP_WIDTH = 1024

export function isSupportedDevice(): boolean {
  if (typeof window === 'undefined') return true

  const wideEnough = window.innerWidth >= MIN_DESKTOP_WIDTH
  const primaryPointerIsCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false

  return wideEnough && !primaryPointerIsCoarse
}
