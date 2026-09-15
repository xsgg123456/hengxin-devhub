import { isolatedIntegration } from './isolated-integration.js'
await isolatedIntegration(async ({ run }) => {
  await run('node_modules/vitest/vitest.mjs', [
    'run',
    'src/auth.integration.test.ts',
    'src/attachments.integration.test.ts',
    'src/db/schema.integration.test.ts',
    'src/modules/demands/workflow.integration.test.ts',
    'src/modules/demands/demand-code.integration.test.ts',
    'src/modules/demands/deletion.integration.test.ts',
    'src/modules/progress/progress.integration.test.ts',
    'src/modules/projects/project-code.integration.test.ts',
    'src/modules/projects/proposal.integration.test.ts',
    'src/modules/projects/acceptance.integration.test.ts',
    'src/modules/risks/risks.integration.test.ts',
    'src/modules/manager-grants/manager-grants.integration.test.ts',
    'src/modules/dashboard/dashboard.integration.test.ts',
    'src/modules/dingtalk/directory.integration.test.ts',
    'src/modules/dingtalk/auth.integration.test.ts',
    'src/modules/notifications/notifications.integration.test.ts',
    'src/modules/notifications/acceptance-notifications.integration.test.ts',
    'src/modules/notifications/robot-notifications.integration.test.ts',
    'src/modules/notifications/manager-risk-digest.integration.test.ts',
    'src/modules/notifications/submission-notifications.integration.test.ts',
    '--maxWorkers=1',
    '--no-file-parallelism'
  ])
  // This suite creates additional identities in the disposable schema after baseline seed checks.
  await run('node_modules/vitest/vitest.mjs', ['run', 'src/modules/approvals/project-approver.integration.test.ts',
    'src/modules/projects/optimization.integration.test.ts', 'src/modules/projects/project-edit.integration.test.ts', 'src/modules/demands/demand-lifecycle.integration.test.ts', '--maxWorkers=1', '--no-file-parallelism'])
})
