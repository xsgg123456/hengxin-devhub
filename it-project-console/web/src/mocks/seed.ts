import type { PrototypeSnapshot } from '@/domain/prototype'
import { DEFAULT_DEMO_USER_ID, DEMO_USERS } from './auth-context'

const INITIAL_UPDATED_AT = '2026-09-04T09:00:00+08:00'

export function createInitialPrototypeSnapshot(): PrototypeSnapshot {
  return {
    schemaVersion: 1,
    revision: 0,
    activeUserId: DEFAULT_DEMO_USER_ID,
    scenario: 'normal',
    updatedAt: INITIAL_UPDATED_AT,
    database: {
      schemaVersion: 1,
      users: structuredClone([...DEMO_USERS]),
      demands: [
        {
          id: 'D-2026-013',
          name: '营销活动预算协同平台',
          department: '市场运营部',
          submitterId: 'user-business-li',
          expectedLaunchDate: '2026-11-20',
          status: 'pending',
          submittedAt: '2026-09-03T15:20:00+08:00'
        },
        {
          id: 'D-2026-009',
          name: '客户数据治理一期',
          department: '市场运营部',
          submitterId: 'user-business-li',
          expectedLaunchDate: '2026-10-30',
          status: 'established',
          submittedAt: '2026-08-12T10:10:00+08:00'
        },
        {
          id: 'D-2026-006',
          name: '采购协同平台升级',
          department: '采购中心',
          submitterId: 'user-business-li',
          expectedLaunchDate: '2026-09-25',
          status: 'established',
          submittedAt: '2026-07-28T09:30:00+08:00'
        },
        {
          id: 'D-2026-004',
          name: '经营分析指标统一',
          department: '财务管理部',
          submitterId: 'user-business-li',
          expectedLaunchDate: '2026-09-30',
          status: 'established',
          submittedAt: '2026-07-10T14:00:00+08:00'
        }
      ],
      projects: [
        {
          id: 'P-2026-008',
          demandId: 'D-2026-009',
          name: '客户数据治理一期',
          department: '市场运营部',
          primaryOwnerId: 'user-engineer-wang',
          collaboratorIds: ['user-engineer-zhao'],
          stage: '开发编码',
          simpleStatus: 'in-progress',
          originalLaunchDate: '2026-10-15',
          expectedLaunchDate: '2026-10-30',
          status: 'active',
          archived: false,
          risks: ['计划较原定晚 15 天'],
          updatedAt: '2026-09-03T17:40:00+08:00'
        },
        {
          id: 'P-2026-006',
          demandId: 'D-2026-006',
          name: '采购协同平台升级',
          department: '采购中心',
          primaryOwnerId: 'user-engineer-zhao',
          collaboratorIds: ['user-engineer-wang'],
          stage: '联调测试',
          simpleStatus: 'blocked',
          originalLaunchDate: '2026-09-18',
          expectedLaunchDate: '2026-09-25',
          status: 'active',
          archived: false,
          risks: ['当前已阻塞：等待供应商测试环境'],
          updatedAt: '2026-09-01T11:25:00+08:00'
        },
        {
          id: 'P-2026-004',
          demandId: 'D-2026-004',
          name: '经营分析指标统一',
          department: '财务管理部',
          primaryOwnerId: 'user-engineer-wang',
          collaboratorIds: [],
          stage: '方案设计',
          simpleStatus: 'in-progress',
          originalLaunchDate: '2026-09-30',
          expectedLaunchDate: '2026-09-30',
          status: 'active',
          archived: false,
          risks: ['已有 4 个工作日未更新'],
          updatedAt: '2026-08-28T16:10:00+08:00'
        }
      ],
      progressUpdates: [
        {
          id: 'U-2026-021',
          projectId: 'P-2026-008',
          authorId: 'user-engineer-wang',
          stage: '开发编码',
          status: 'in-progress',
          summary: '客户主数据清洗规则已完成首轮联调。',
          createdAt: '2026-09-03T17:40:00+08:00'
        }
      ]
    }
  }
}
