import { createApp } from 'vue'
import ProductionAuthBoundary from '@/components/system/production-auth-boundary.vue'

export function bootstrapProduction(): void {
  createApp(ProductionAuthBoundary).mount('#app')
}
