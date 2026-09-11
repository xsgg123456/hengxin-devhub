import { parseArgs } from 'node:util'
import { createPrisma } from '../plugins/prisma.js'
import { setEngineerOverride } from '../modules/manager-grants/engineer-override-service.js'

const { values } = parseArgs({ options: {
  'user-id': { type: 'string' }, 'ding-user-id': { type: 'string' }, 'actor-id': { type: 'string' },
  action: { type: 'string' }, reason: { type: 'string' }, apply: { type: 'boolean', default: false }
} })
if (!values['user-id'] || !values['ding-user-id'] || !values['actor-id'] || !values.reason?.trim() ||
  !['grant', 'revoke'].includes(values.action ?? ''))
  throw new Error('用法: --user-id <内部ID> --ding-user-id <钉钉ID> --actor-id <管理人员ID> --action grant|revoke --reason <原因> [--apply]')
if (!process.env.DATABASE_URL) throw new Error('缺少 DATABASE_URL')
const db = createPrisma(process.env.DATABASE_URL)
try {
  if (!values.apply) {
    const user = await db.user.findUniqueOrThrow({ where: { id: values['user-id'] },
      select: { id: true, dingUserId: true, name: true, department: true, role: true, active: true, engineerOverride: true } })
    if (user.dingUserId !== values['ding-user-id']) throw new Error('钉钉身份不匹配')
    console.log(JSON.stringify({ dryRun: true, user, action: values.action, reason: values.reason }))
  } else {
    console.log(JSON.stringify(await setEngineerOverride(db, {
      userId: values['user-id'], dingUserId: values['ding-user-id'], actorId: values['actor-id'],
      enabled: values.action === 'grant', reason: values.reason
    })))
  }
} finally { await db.$disconnect() }
