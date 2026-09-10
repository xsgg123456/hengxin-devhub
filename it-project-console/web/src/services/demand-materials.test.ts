import { expect, it } from 'vitest'
import { demandMaterials } from './demand-materials'
import { validateMaterials } from './workflow-validation'
import type { DemoAttachment } from '@/domain/prototype'

const file = (name: string, size = 1024): DemoAttachment => ({ kind: 'file', name, size, status: 'ready' })
it('旧双材料和统一列表合并去重，旧链接不丢失', () => {
  const old = { ...file('设计稿.psd'), attachmentId: 'old' }
  const link: DemoAttachment = { kind: 'link', name: '原型', url: 'https://example.com', status: 'ready' }
  expect(demandMaterials({ attachments: [old, file('演示.mp4')], prd: old, prototype: link }))
    .toEqual([old, file('演示.mp4'), link])
})
it('至少一个完成文件、任意格式、100/500MB边界与失败文件', () => {
  expect(() => validateMaterials([])).toThrow('至少')
  expect(() => validateMaterials([], false)).not.toThrow()
  expect(() => validateMaterials([{ kind: 'link', name: '历史资料', url: 'https://example.com', status: 'ready' }])).toThrow('至少')
  expect(() => validateMaterials([file('无扩展名'), file('模型.blend'), file('压缩包.7z')])).not.toThrow()
  const max = 100 * 1024 * 1024
  expect(() => validateMaterials([file('a', max)])).not.toThrow()
  expect(() => validateMaterials([file('a', max + 1)])).toThrow('100 MB')
  const five = Array.from({length: 5}, (_, i) => file(String(i), max))
  expect(() => validateMaterials(five)).not.toThrow()
  expect(() => validateMaterials([...five, file('extra', 1)])).toThrow('500 MB')
  expect(() => validateMaterials([file('ok'), { ...file('failed'), status: 'failed' }])).toThrow('重试')
})
