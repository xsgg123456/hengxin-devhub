import type { PrototypeDatabase, PrototypeScenario } from '@/domain/prototype'

export const PROTOTYPE_SCENARIOS: {
  value: PrototypeScenario
  label: string
  description: string
}[] = [
  { value: 'normal', label: '正常', description: '正常展示和保存业务数据。' },
  {
    value: 'empty',
    label: '空数据',
    description: '仅展示空视图，已保存数据保留；恢复正常后可继续操作。'
  },
  { value: 'loading', label: '加载', description: '模拟页面加载中，可随时恢复正常。' },
  {
    value: 'network-error',
    label: '网络错误',
    description: '模拟网络读取失败，恢复正常即可重试。'
  },
  {
    value: 'save-error',
    label: '保存失败',
    description: '可填写表单，提交会失败并保留输入；已保存数据不变。'
  },
  { value: 'forbidden', label: '无权限', description: '模拟无查看和操作权限，恢复正常即可继续。' }
]

export function projectScenarioDatabase(
  database: PrototypeDatabase,
  scenario: PrototypeScenario
): PrototypeDatabase {
  if (scenario !== 'empty') return database
  return {
    ...database,
    demands: [],
    projects: [],
    progressUpdates: [],
    stageHistories: [],
    scheduleChanges: [],
    lifecycleEvents: []
  }
}
