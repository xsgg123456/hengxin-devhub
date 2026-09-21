import { describe, expect, it } from 'vitest'
import { createInitialPrototypeSnapshot } from '@/mocks/seed'
import { currentDemandOwner, effectiveDemand, effectiveDemands } from './demand-view'

describe('需求当前归属解析', () => {
  it('项目改派部门和业务负责人后，详情、列表和统计共用最新值并保留原始提交人', () => {
    const snapshot = createInitialPrototypeSnapshot()
    const db = snapshot.database
    const source = db.demands.find((demand) => demand.id === db.projects[0]!.demandId)!
    const project = db.projects[0]!
    project.department = '业务实际部门'
    project.businessOwnerId = 'user-business-li'
    source.department = '旧部门'
    source.submitterId = 'user-engineer-wang'

    const current = effectiveDemand(db, source)
    expect(current).toMatchObject({
      department: '业务实际部门',
      currentOwnerId: 'user-business-li',
      businessOwnerId: 'user-business-li',
      projectId: project.id,
      submitterId: 'user-engineer-wang'
    })
    expect(effectiveDemands(db).find((demand) => demand.id === source.id)).toMatchObject({
      department: '业务实际部门',
      currentOwnerId: 'user-business-li'
    })
  })

  it('项目已关联但清空业务负责人时，不回退到原提出人', () => {
    const snapshot = createInitialPrototypeSnapshot()
    const db = snapshot.database
    const source = db.demands.find((demand) => demand.id === db.projects[0]!.demandId)!
    db.projects[0]!.businessOwnerId = null
    const current = effectiveDemand(db, source)
    expect(current.currentOwnerId).toBeNull()
    expect(currentDemandOwner(current)).toBeNull()
  })
})
