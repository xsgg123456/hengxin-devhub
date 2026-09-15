import { isolatedIntegration } from './isolated-integration.js'
await isolatedIntegration(async ({ run }) => {
  await run('node_modules/vitest/vitest.mjs', ['run', 'src/modules/workspace/workspace-sync.integration.test.ts', '--maxWorkers=1', '--no-file-parallelism'])
})
