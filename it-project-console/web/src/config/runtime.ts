export type RuntimeMode = 'prototype' | 'production'

const isPrototypeBuild = import.meta.env.MODE === 'prototype'

export const runtimeConfig = Object.freeze({
  mode: (isPrototypeBuild ? 'prototype' : 'production') as RuntimeMode,
  isPrototype: isPrototypeBuild,
  apiBaseUrl: import.meta.env.VITE_API_URL || '/api'
})
