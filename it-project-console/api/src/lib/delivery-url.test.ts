import { expect, it } from 'vitest'
import { deliveryHref } from './delivery-url.js'
it.each([
  ['', ''], ['www.baidu.com', 'http://www.baidu.com/'],
  ['192.168.1.10:8080/project', 'http://192.168.1.10:8080/project'],
  ['intranet:8080/project', 'http://intranet:8080/project'],
  ['intranet', 'http://intranet/'],
  ['http://10.0.0.8:3000/a?x=1#tab', 'http://10.0.0.8:3000/a?x=1#tab'],
  ['https://intranet/app', 'https://intranet/app'],
  ['[fd00::1]:8080/app', 'http://[fd00::1]:8080/app'],
  ['  example.com/path  ', 'http://example.com/path']
])('交付地址 %s 解析为 %s', (input, expected) => {
  expect(deliveryHref(input)).toBe(expected)
})
it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'ftp://intranet/a',
  'https://user:pass@example.com', 'user:pass@example.com', 'http://',
  '/relative', '//example.com', 'http://bad host', 'x'.repeat(2001),
  'java\nscript:alert(1)', 'http://host\\evil'])('拒绝非网页或无效地址 %s', input => {
  expect(deliveryHref(input)).toBeNull()
})
