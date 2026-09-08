import { expect, test } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { key, snapshot, identity, card } from './review-helpers'

async function scenario(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: '切换演示身份' }).click()
  await page
    .locator('.el-select')
    .filter({ has: page.getByRole('combobox', { name: '演示场景', exact: true }) })
    .click()
  await page.getByRole('option', { name: label, exact: true }).click()
  await page.getByRole('button', { name: '切换演示身份' }).click()
}

test('菜单场景切换与恢复不破坏已保存业务数据', async ({ page }) => {
  await page.goto('/')
  const before = (await snapshot(page)).database
  for (const [label, state, text] of [
    ['空数据', 'empty', '暂无'],
    ['加载', 'loading', '正在加载'],
    ['网络错误', 'network-error', '网络'],
    ['无权限', 'forbidden', '当前场景无查看权限']
  ] as const) {
    await scenario(page, label)
    await expect.poll(async () => (await snapshot(page)).scenario).toBe(state)
    await expect(page.locator('.business-page-state')).toContainText(text)
    await expect(page.locator('[data-project-id]')).toHaveCount(0)
    expect((await snapshot(page)).database).toEqual(before)
    await page.getByRole('button', { name: '恢复正常', exact: true }).click()
    await expect(page.locator('[data-project-id]').first()).toBeVisible()
    expect((await snapshot(page)).database).toEqual(before)
  }
})

test('保存失败保持输入，恢复正常后仅提交一次并更新共享数据', async ({ page }) => {
  await page.goto('/')
  await identity(page, '王浩然')
  await scenario(page, '保存失败')
  const before = (await snapshot(page)).database
  await card(page, '客户数据治理一期').getByRole('button', { name: '更新进度' }).click()
  const drawer = page.getByRole('dialog', { name: '更新项目进度' })
  await drawer.getByLabel('进展说明', { exact: true }).fill('失败后继续编辑并恢复成功')
  await drawer.getByRole('spinbutton', { name: '整体进度（%）' }).fill('68')
  const submit = drawer.getByRole('button', { name: '保存进度' })
  await submit.click()
  await expect(drawer.getByRole('alert')).toContainText('失败')
  await expect(drawer.getByLabel('进展说明', { exact: true })).toHaveValue(
    '失败后继续编辑并恢复成功'
  )
  expect((await snapshot(page)).database).toEqual(before)
  await drawer.getByRole('button', { name: '恢复正常并保留输入', exact: true }).click()
  await expect(drawer.getByLabel('进展说明', { exact: true })).toHaveValue(
    '失败后继续编辑并恢复成功'
  )
  await submit.click()
  await expect(submit).toBeDisabled()
  await expect(drawer).not.toBeVisible()
  const after = (await snapshot(page)).database
  expect(after.projects.find((p) => p.name === '客户数据治理一期')?.overallProgress).toBe(68)
  expect(after.progressUpdates.length).toBe(before.progressUpdates.length + 1)
})

test('损坏JSON必须确认重置，取消保留原值，确认恢复业务', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((k) => localStorage.setItem(k, '{broken'), key)
  await page.reload()
  await expect(page.getByText('演示数据异常', { exact: true })).toBeVisible()
  await expect(page.locator('[data-project-id]')).toHaveCount(0)
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await expect(page.getByRole('alert').first()).toContainText('仍无法读取')
  await page.getByRole('button', { name: '重置演示数据', exact: true }).click()
  await page.getByRole('button', { name: '保留当前数据', exact: true }).click()
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{broken')
  await page.getByRole('button', { name: '重置演示数据', exact: true }).click()
  await page.getByRole('button', { name: '确认重置', exact: true }).click()
  await expect(page.getByRole('button', { name: '切换演示身份' })).toBeVisible()
  expect((await snapshot(page)).database.projects.length).toBeGreaterThan(0)
})

test('损坏恢复写入失败明确报错并保留原始损坏值', async ({ page }) => {
  await page.goto('/')
  await snapshot(page)
  await page.evaluate((k) => localStorage.setItem(k, '{broken'), key)
  await page.reload()
  await expect(page.getByText('演示数据异常', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage denied', 'SecurityError')
    }
  })
  await page.getByRole('button', { name: '重置演示数据', exact: true }).click()
  await page.getByRole('button', { name: '确认重置', exact: true }).click()
  await expect(page.getByRole('alert').first()).toContainText('重置失败')
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe('{broken')
  await expect(page.locator('[data-project-id]')).toHaveCount(0)
})

test.describe('生产静态产物边界', () => {
  let server: Server
  let origin: string
  const dist = resolve('dist')
  test.beforeAll(async () => {
    await readFile(resolve(dist, 'index.html')) // pnpm build must precede E2E.
    server = createServer(async (request, response) => {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
      if (path === '/api/workspace') {
        response.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '请登录' } }))
        return
      }
      const target = resolve(dist, '.' + (path === '/' ? '/index.html' : path))
      if (!target.startsWith(dist + '/') && !target.startsWith(dist + '\\')) {
        response.writeHead(403).end()
        return
      }
      try {
        const data = await readFile(target)
        response.setHeader(
          'Content-Type',
          (
            {
              '.html': 'text/html',
              '.js': 'application/javascript',
              '.css': 'text/css',
              '.svg': 'image/svg+xml'
            } as Record<string, string>
          )[extname(target)] ?? 'application/octet-stream'
        )
        response.end(data)
      } catch {
        response.writeHead(404).end()
      }
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Loopback server address unavailable')
    origin = `http://127.0.0.1:${address.port}`
  })
  test.afterAll(async () => {
    if (server)
      await new Promise<void>((done, reject) => server.close((e) => (e ? reject(e) : done())))
  })
  for (const route of [
    '/#/project-overview',
    '/#/my-demands',
    '/?mock=true&mode=prototype&scenario=normal#/project-overview'
  ]) {
    test(`直接路由与Mock开关均不能越过未开放登录边界 ${route}`, async ({ page, browser }) => {
      await page.goto('/')
      const demo = await snapshot(page)
      const context = await browser.newContext()
      try {
        await context.addInitScript(
          ({ key, demo }) => localStorage.setItem(key, JSON.stringify(demo)),
          { key, demo }
        )
        const production = await context.newPage()
        const errors: string[] = []
        const api: string[] = []
        production.on('pageerror', (e) => errors.push(e.message))
        production.on('request', (r) => {
          if (r.resourceType() === 'fetch' || r.resourceType() === 'xhr') api.push(r.url())
        })
        await production.goto(origin + route)
        await expect(production.getByRole('heading', { name: '企业登录暂未开放' })).toBeVisible()
        await expect(
          production.getByText('请联系系统管理员确认开放时间。', { exact: true })
        ).toBeVisible()
        await expect(
          production.getByText(/演示模式|切换演示身份|重置演示数据|客户数据治理一期/)
        ).toHaveCount(0)
        await expect(production.locator('[data-project-id], .el-table__row')).toHaveCount(0)
        expect(await production.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key)).toEqual(
          demo
        )
        expect(errors).toEqual([])
        expect(api).toEqual([origin + '/api/workspace'])
      } finally {
        await context.close()
      }
    })
  }
  test('实际提供的所有JS不包含演示账户种子或控制入口', async ({ request }) => {
    const files = await readdir(resolve(dist, 'assets'))
    const scripts = files.filter((name) => name.endsWith('.js'))
    expect(scripts.length).toBeGreaterThan(0)
    for (const name of scripts) {
      const response = await request.get(`${origin}/assets/${name}`)
      expect(response.ok()).toBe(true)
      expect(await response.text()).not.toMatch(
        /DEMO_USERS|切换演示身份|重置演示数据|演示场景|客户数据治理一期|营销活动预算协同平台/
      )
    }
  })
})
