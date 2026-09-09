import { readdir, readFile } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'

const root = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Provide extracted payload directory')
let checked = 0
async function scan(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const full = join(path, item.name), name = relative(root, full).replaceAll('\\', '/')
    if (item.isSymbolicLink()) throw new Error(`Unexpected payload symlink: ${name}`)
    if (item.isDirectory()) { await scan(full); continue }
    if (/^\.env($|\.)|\.(pem|key|db|sqlite|sqlite3|map)$|^seed\.(js|ts)$|\.(test|spec)\./i.test(item.name)) {
      throw new Error(`Private/development file in payload: ${name}`)
    }
    if (!/\.(js|css|html|json|prisma|sql)$/.test(item.name)) continue
    const text = await readFile(full, 'utf8')
    if (/(?:[A-Z]:[\\/](?:Users|Work_Project)[\\/]|\/Users\/|sk-(?:proj|ant)-[A-Za-z0-9_-]{12})/.test(text)) {
      throw new Error(`Private path or credential pattern in payload: ${name}`)
    }
    if (name.startsWith('web/') && /DEMO_USERS|切换演示身份|重置演示数据|客户数据治理一期|营销活动预算协同平台/.test(text)) {
      throw new Error(`Demo data in production web payload: ${name}`)
    }
    checked++
  }
}
await scan(root)
console.log(`Payload privacy audit passed (${checked} text files).`)
