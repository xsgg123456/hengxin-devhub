import { createApp } from 'vue'
import App from '@/App.vue'
import { initStore, store } from '@/store'
import { initRouter, router } from '@/router'
import { getHomePath } from '@/router/access'
import language from '@/locales'
import { isSupportedDevice } from '@/utils/device'
import { usePrototypeStore } from '@/store/modules/prototype'
import { syncPrototypeShell } from '@/prototype/sync-shell'
import { setupGlobDirectives } from '@/directives'
import { setupErrorHandle } from '@/utils/sys/error-handle'

export function bootstrapProduction(): void {
  const initialPath = window.location.hash.slice(1)
  const app = createApp(App)
  initStore(app)
  window.addEventListener('itpc-session-expired', () => {
    const state = usePrototypeStore(store)
    state.snapshot = null
    state.ready = false
    state.authRequired = true
  })

  if (isSupportedDevice()) {
    const prototypeStore = usePrototypeStore(store)
    void prototypeStore
      .refreshLive()
      .then(() => {
        syncPrototypeShell(prototypeStore.currentUser.role)
        return router.replace(
          initialPath && initialPath !== '/'
            ? initialPath
            : getHomePath(prototypeStore.currentUser.role)
        )
      })
      .catch(() => {})
    syncPrototypeShell(prototypeStore.currentUser.role)
  }

  initRouter(app)
  setupGlobDirectives(app)
  setupErrorHandle(app)
  app.use(language)
  app.mount('#app')
}
