export type RuntimeMode = 'prototype' | 'live' | 'production'

const isPrototypeBuild = import.meta.env.MODE === 'prototype'

export const runtimeConfig = Object.freeze({
  mode: (isPrototypeBuild
    ? 'prototype'
    : import.meta.env.MODE === 'live'
      ? 'live'
      : 'production') as RuntimeMode,
  isPrototype: isPrototypeBuild,
  isLiveDevelopment: import.meta.env.MODE === 'live',
  apiBaseUrl: import.meta.env.VITE_API_URL || '/api'
})
