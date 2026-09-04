export type SystemRole = 'business' | 'engineer' | 'manager'
export type PrototypeScenario = 'normal' | 'empty' | 'loading' | 'save-error' | 'forbidden'
export type DemandStatus = 'pending' | 'returned' | 'established' | 'withdrawn'
export type ProjectStatus = 'active' | 'completed' | 'cancelled'
export type SimpleStatus = 'not-started' | 'in-progress' | 'nearly-done' | 'completed' | 'blocked'

export const PROJECT_STAGES = [
  '需求受理',
  '立项评审',
  '方案设计',
  '开发编码',
  '联调测试',
  '上线部署',
  '验收交付'
] as const

export type ProjectStage = (typeof PROJECT_STAGES)[number]

export interface DemoUser {
  id: string
  name: string
  department: string
  role: SystemRole
  roleLabel: '业务人员' | 'IT工程师' | '管理人员'
}

export interface DemoDemand {
  id: string
  name: string
  department: string
  submitterId: string
  expectedLaunchDate: string
  status: DemandStatus
  submittedAt: string
}

export interface DemoProject {
  id: string
  demandId: string
  name: string
  department: string
  primaryOwnerId: string
  collaboratorIds: string[]
  stage: ProjectStage
  simpleStatus: SimpleStatus
  originalLaunchDate: string
  expectedLaunchDate: string
  status: ProjectStatus
  archived: boolean
  risks: string[]
  updatedAt: string
}

export interface DemoProgressUpdate {
  id: string
  projectId: string
  authorId: string
  stage: ProjectStage
  status: SimpleStatus
  summary: string
  createdAt: string
}

export interface PrototypeDatabase {
  schemaVersion: 1
  users: DemoUser[]
  demands: DemoDemand[]
  projects: DemoProject[]
  progressUpdates: DemoProgressUpdate[]
}

export interface PrototypeSnapshot {
  schemaVersion: 1
  revision: number
  activeUserId: string
  scenario: PrototypeScenario
  database: PrototypeDatabase
  updatedAt: string
}
