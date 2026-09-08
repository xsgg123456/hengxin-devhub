import { defineConfig, devices } from '@playwright/test'
if (process.env.LIVE_E2E_ISOLATED !== 'true') throw new Error('仅允许从隔离browser-integration入口运行')
export default defineConfig({
  testDir: './e2e-live', fullyParallel: false, workers: 1, retries: 0, timeout: 90_000,
  reporter: [['list']], outputDir: 'test-results/live',
  use: { baseURL: 'http://127.0.0.1:4325', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium-live', use: { ...devices['Desktop Chrome'] } }]
})
