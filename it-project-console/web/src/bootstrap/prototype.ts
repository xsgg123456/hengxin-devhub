import { createApp } from 'vue'
import App from '@/App.vue'
import { initStore, store } from '@/store'
import { initRouter } from '@/router'
import language from '@/locales'
import { isSupportedDevice } from '@/utils/device'
import { usePrototypeStore } from '@/store/modules/prototype'
import { syncPrototypeShell } from '@/prototype/sync-shell'
import { setupGlobDirectives } from '@/directives'
import { setupErrorHandle } from '@/utils/sys/error-handle'

export function bootstrapPrototype(): void {
  const app = createApp(App)
  initStore(app)

  if (isSupportedDevice()) {
    const prototypeStore = usePrototypeStore(store)
    prototypeStore.initialize()
    syncPrototypeShell(prototypeStore.currentUser.role)
  }

  initRouter(app)
  setupGlobDirectives(app)
  setupErrorHandle(app)
  app.use(language)
  app.mount('#app')
}
