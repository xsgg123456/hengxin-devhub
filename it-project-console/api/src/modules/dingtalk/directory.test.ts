import { expect, it, vi } from 'vitest'
import { directoryMap, fetchDirectory } from './dingtalk-directory.js'

const staff = vi.fn()
it('沿部门树分页读取、跨部门去重，详情并发不超过五个', async () => {
  let active = 0, maximum = 0
  const details = vi.fn(async (userId: string) => {
    active++; maximum = Math.max(active, maximum)
    await new Promise(resolve => setTimeout(resolve, 1))
    active--
    return { userId, unionId: `union-${userId}`, name: userId, departmentIds: ['2'], active: true }
  })
  const legacy = vi.fn(async (path: string, body: unknown) => {
    const input = body as { dept_id: number; cursor: number }
    if (path.endsWith('department/get')) return { result: { name: '企业' } }
    if (path.endsWith('listsub')) return { result: input.dept_id === 1 ? [{ dept_id: 2, parent_id: 1, name: '信息技术部' }] : [] }
    return { result: { list: Array.from({ length: 6 }, (_, i) => ({ userid: `u${i + input.cursor}` })), has_more: input.cursor === 0, next_cursor: 6 } }
  })
  const result = await fetchDirectory({ legacy, staff: details })
  expect(result.users).toHaveLength(12)
  expect(result.departments).toHaveLength(2)
  expect(details).toHaveBeenCalledTimes(12)
  expect(maximum).toBe(5)
})

it.each([
  { list: [], has_more: true, next_cursor: 0 },
  { list: [{ name: '缺少身份' }], has_more: false },
  { list: [], has_more: 'false' }
])('分页畸形数据拒绝作为完整快照 %j', async result => {
  const legacy = vi.fn(async (path: string) => path.endsWith('department/get') ? { result: { name: '企业' } } : path.endsWith('listsub') ? { result: [] } : { result })
  await expect(fetchDirectory({ legacy, staff })).rejects.toMatchObject({ code: 'DINGTALK_DATA' })
})

it('详情读取失败使整批失败，空集合无需工作线程', async () => {
  expect(await directoryMap([], async value => value)).toEqual([])
  await expect(directoryMap([1, 2], async () => { throw new Error('权限不足') })).rejects.toThrow('权限不足')
})
