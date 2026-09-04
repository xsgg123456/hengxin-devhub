import '@styles/core/tailwind.css'
import '@styles/index.scss'

if (import.meta.env.MODE === 'prototype') {
  void import('./bootstrap/prototype').then(({ bootstrapPrototype }) => bootstrapPrototype())
} else {
  void import('./bootstrap/production').then(({ bootstrapProduction }) => bootstrapProduction())
}
