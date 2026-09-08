import { isolatedIntegration } from './isolated-integration.js'
await isolatedIntegration(async ({ run }) => {
  await run('node_modules/vitest/vitest.mjs', [
    'run', 'src/auth.integration.test.ts', 'src/attachments.integration.test.ts',
    'src/db/schema.integration.test.ts', 'src/modules/demands/workflow.integration.test.ts',
    '--maxWorkers=1', '--no-file-parallelism'
  ])
})
