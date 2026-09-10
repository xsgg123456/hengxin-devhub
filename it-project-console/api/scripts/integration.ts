import { isolatedIntegration } from './isolated-integration.js'
await isolatedIntegration(async ({ run }) => {
  await run('node_modules/vitest/vitest.mjs', [
    'run',
    'src/auth.integration.test.ts',
    'src/attachments.integration.test.ts',
    'src/db/schema.integration.test.ts',
    'src/modules/demands/workflow.integration.test.ts',
    'src/modules/demands/deletion.integration.test.ts',
    'src/modules/progress/progress.integration.test.ts',
    'src/modules/risks/risks.integration.test.ts',
    'src/modules/manager-grants/manager-grants.integration.test.ts',
    'src/modules/dashboard/dashboard.integration.test.ts',
    'src/modules/dingtalk/directory.integration.test.ts',
    'src/modules/dingtalk/auth.integration.test.ts',
    'src/modules/notifications/notifications.integration.test.ts',
    'src/modules/notifications/manager-risk-digest.integration.test.ts',
    '--maxWorkers=1',
    '--no-file-parallelism'
  ])
})
