import type { App } from 'vue'
import { createPinia } from 'pinia'
import 'pinia-plugin-persistedstate'

export const store = createPinia()

export function initStore(app: App<Element>): void {
  app.use(store)
}
