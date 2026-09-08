import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { createServer } from 'node:net'
import { isolatedIntegration } from './isolated-integration.js'

async function freePort() {
  const server = createServer()
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('未取得隔离API端口')
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  return address.port
}
function start(entry: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [entry, ...args], { cwd, env, stdio: 'inherit', windowsHide: true })
  child.on('error', error => { console.error(error.message) })
  return child
}
async function ready(url: string, child: ChildProcess) {
  const until = Date.now() + 90_000
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`隔离服务启动失败 (${child.exitCode})`)
    try { if ((await fetch(url)).ok) return } catch { /* Wait for this owned service. */ }
    await new Promise(done => setTimeout(done, 300))
  }
  throw new Error('隔离服务启动超时')
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') {
    await new Promise<void>(done => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.on('exit', () => done()); killer.on('error', () => done())
    })
  } else child.kill('SIGTERM')
}
await isolatedIntegration(async ({ env }) => {
  const apiRoot = process.cwd(), webRoot = resolve('../web')
  const port = await freePort()
  const origin = 'http://127.0.0.1:4325'
  const apiEnv = { ...env, PORT: String(port), HOST: '127.0.0.1', WEB_ORIGIN: origin }
  const webEnv = { ...apiEnv, VITE_API_PROXY_URL: `http://127.0.0.1:${port}`, VITE_PORT: '4325', LIVE_E2E_ISOLATED: 'true' }
  const api = start(resolve('node_modules/tsx/dist/cli.mjs'), ['src/server.ts'], apiRoot, apiEnv)
  let web: ChildProcess | undefined
  try {
    await ready(`http://127.0.0.1:${port}/health/ready`, api)
    web = start(resolve(webRoot, 'node_modules/vite/bin/vite.js'), ['--mode', 'live', '--host', '127.0.0.1', '--port', '4325', '--strictPort'], webRoot, webEnv)
    await ready(origin, web)
    await new Promise<void>((done, reject) => {
      const test = start(resolve(webRoot, 'node_modules/@playwright/test/cli.js'), ['test', '--config=playwright.live.config.ts'], webRoot, webEnv)
      test.on('error', reject)
      test.on('exit', code => code === 0 ? done() : reject(new Error(`真实浏览器验收失败 (${code})`)))
    })
  } finally {
    if (web) await stop(web)
    await stop(api)
  }
})
