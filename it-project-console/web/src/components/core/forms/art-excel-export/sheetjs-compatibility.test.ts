import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

describe('Art Excel 组件使用的 SheetJS 文件格式兼容性', () => {
  it.each(['xlsx', 'biff8'] as const)('保留 %s 文件的中文表头、值与首工作表导入', (bookType) => {
    const rows = [
      { 序号: '1', 项目: '恒信项目', 进度: '75%', 已完成: '否', 备注: '' },
      { 序号: '2', 项目: '交付验收', 进度: '100%', 已完成: '是', 备注: '中文与 & < >' }
    ]
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(rows)
    sheet['!cols'] = [{ wch: 8 }, { wch: 24 }]
    XLSX.utils.book_append_sheet(workbook, sheet, '项目数据')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ 忽略: '第二张表' }]), '其他')
    const buffer = XLSX.write(workbook, { bookType, type: 'array', compression: true })
    const imported = XLSX.read(buffer, { type: 'array' })
    expect(imported.SheetNames[0]).toBe('项目数据')
    expect(XLSX.utils.sheet_to_json(imported.Sheets[imported.SheetNames[0]])).toEqual(rows)
  })
})
