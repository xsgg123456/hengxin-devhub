import { spawn } from 'node:child_process'
if (!process.env.npm_execpath) throw new Error('请通过 pnpm audit:api 运行')
const child = spawn(process.execPath, [process.env.npm_execpath, 'audit', '--json'], { windowsHide: true })
let output = ''
child.stdout.on('data', data => { output += data })
child.stderr.pipe(process.stderr)
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('close', code => {
  try {
    const report = JSON.parse(output)
    if (!report.metadata || !report.advisories || ![0, 1].includes(code)) throw new Error('审计结果无效或网络失败')
    const api = Object.values(report.advisories).filter(advisory =>
      advisory.findings?.some(finding => finding.paths?.some(path => path.startsWith('api>'))))
    for (const advisory of api) console.log(`${advisory.severity}: ${advisory.module_name} — ${advisory.title}`)
    console.log(`API 完整依赖路径审计：${api.length} 条公告（含开发依赖）。全 workspace 结果另行记录。`)
    process.exitCode = api.some(a => ['high', 'critical'].includes(a.severity)) ? 1 : 0
  } catch {
    console.error('无法取得有效依赖审计结果，请检查网络后重试')
    process.exitCode = 1
  }
})
