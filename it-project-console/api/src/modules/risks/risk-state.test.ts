import { expect, it } from 'vitest'
import { riskState } from './risk-state.js'
it('风险天数仅作展示，跨日不构成新提醒',()=>{
 expect(riskState(['环节延期 2 天','已有 3 个工作日未更新整体进度']))
  .toBe(riskState(['已有 4 个工作日未更新整体进度','环节延期 3 天']))
 expect(riskState(['项目延期 1 天'])).not.toBe(riskState(['环节延期 1 天']))
})
it('新风险、解除及阻塞原因变化仍产生不同状态',()=>{
 expect(riskState(['当前已阻塞：等待3号服务器'])).not.toBe(riskState(['当前已阻塞：等待4号服务器']))
 expect(riskState([])).not.toBe(riskState(['项目延期 3 天']))
})
