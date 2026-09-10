import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

test('真实未配置钉钉提示、配置故障重试及Art登录页面', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'登录 IT 项目管理台'})).toBeVisible()
  await expect(page.getByText('企业登录尚未配置，请联系管理员',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'钉钉扫码登录',exact:true})).toHaveCount(0)
  await expect(page.locator('.color-picker-expandable, .theme-btn')).toHaveCount(0)
  await page.route('**/api/auth/dingtalk/config',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'配置读取暂不可用'}})}),{times:1})
  await page.getByRole('button',{name:'重新检查登录配置'}).click()
  await expect(page.getByText('配置读取暂不可用',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'重新检查登录配置'}).click()
  await expect(page.getByText('企业登录尚未配置，请联系管理员',{exact:true})).toBeVisible()
  await mkdir(resolve('../output'),{recursive:true})
  await expect(page.locator('.el-alert')).toHaveCSS('opacity','1')
  await page.screenshot({path:resolve('../output/phase9-login.png'),fullPage:true})
})

test('扫码入口携带站内深链，授权失败显示重试',async({page})=>{
  await page.route('**/api/auth/dingtalk/config',route=>route.fulfill({json:{data:{enabled:true,clientId:'browser-fixture',corpId:'fixture'}}}))
  await page.goto('/#/project-overview?projectId=fixture')
  await expect(page.getByRole('button',{name:'钉钉扫码登录',exact:true})).toBeVisible()
  let startUrl=''
  await page.route('**/api/auth/dingtalk/start?*',async route=>{startUrl=route.request().url();await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<p>隔离授权跳转检查</p>'})})
  await page.getByRole('button',{name:'钉钉扫码登录',exact:true}).click()
  await expect(page.getByText('隔离授权跳转检查')).toBeVisible()
  expect(new URL(startUrl).searchParams.get('returnTo')).toBe('/#/project-overview?projectId=fixture')
  await page.goto('/#/auth/login?dingError=authorization_failed')
  await expect(page.getByText('钉钉授权失败或已取消，请重新登录',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'钉钉扫码登录',exact:true}).click()
  await expect(page.getByText('隔离授权跳转检查')).toBeVisible()
  expect(new URL(startUrl).searchParams.get('returnTo')).toBe('/#/')
})

test('手机即使桌面宽度也不请求业务API',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},userAgent:'Mozilla/5.0 (iPhone) Mobile DingTalk'})
  const page=await context.newPage(),requests:string[]=[]
  page.on('request',r=>{if(/\/api\/(workspace|dashboard|workload|gantt)/.test(r.url()))requests.push(r.url())})
  try {
    await page.goto('http://127.0.0.1:4325/')
    await expect(page.getByRole('heading',{name:'请在电脑端使用'})).toBeVisible()
    expect(requests).toEqual([])
  } finally {await context.close()}
})
