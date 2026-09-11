export type SystemRole = 'business' | 'engineer' | 'manager'
export type PrototypeScenario =
  'normal' | 'empty' | 'loading' | 'network-error' | 'save-error' | 'forbidden'
export type DemandStatus =
  'draft' | 'pending' | 'returned' | 'rejected' | 'established' | 'withdrawn'
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
export const SCHEDULE_REASONS = [
  '业务新增或变更需求',
  '技术问题',
  '等待外部资源',
  '人员安排变化',
  '其他'
] as const
export type ProjectStage = (typeof PROJECT_STAGES)[number]
export interface DemoUser {
  engineerEligible?: boolean
  id: string
  name: string
  department: string
  role: SystemRole
  roleLabel: '业务人员' | 'IT工程师' | '管理人员'
}
export interface DemoAttachment {
  attachmentId?: string
  kind: 'file' | 'link'
  name: string
  url?: string
  size?: number
  mime?: string
  status: 'ready' | 'failed' | 'uploading'
}
export interface DemoDemand {
  attachments?: DemoAttachment[]
  version?: number
  id: string
  requestId: string
  name: string
  description: string
  department: string
  submitterId: string
  expectedLaunchDate: string
  prd: DemoAttachment | null
  prototype: DemoAttachment | null
  status: DemandStatus
  reviewReason: string
  reviewedBy?: string
  reviewedAt?: string
  submittedAt: string
}
export interface StagePlan {
  stage: ProjectStage
  startDate: string
  endDate: string
  originalStartDate?: string
  originalEndDate?: string
}
export interface DemoProject {
  code?: string
  stagePlans?: StagePlan[]
  actualCompletedAt?: string | null
  riskVersion?: number
  version?: number
  id: string
  requestId: string
  demandId: string | null
  source: 'demand' | 'direct'
  name: string
  department: string
  priority: 'P0' | 'P1' | 'P2'
  primaryOwnerId: string
  collaboratorIds: string[]
  stage: ProjectStage
  simpleStatus: SimpleStatus
  overallProgress: number
  stageExpectedDate: string
  originalLaunchDate: string
  expectedLaunchDate: string
  originalDeliveryDate: string
  expectedDeliveryDate: string
  status: ProjectStatus
  archived: boolean
  risks: string[]
  blocker: string
  createdAt: string
  lastOverallUpdatedAt: string
  updatedAt: string
}
export interface DemoProgressUpdate {
  id: string
  projectId: string
  authorId: string
  kind: 'overall' | 'personal'
  overallProgress?: number
  stage: ProjectStage
  status: SimpleStatus
  summary: string
  blocker: string
  createdAt: string
}
export interface DemoStageHistory {
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  projectId: string
  stage: ProjectStage
  startedAt: string
  completedAt: string | null
  interruptedAt?: string
}
export interface DemoScheduleChange {
  id: string
  projectId: string
  field:
    | 'stageExpectedDate'
    | 'expectedLaunchDate'
    | 'expectedDeliveryDate'
    | `stage:${ProjectStage}:startDate`
    | `stage:${ProjectStage}:endDate`
  oldValue: string
  newValue: string
  reason: string
  description: string
  authorId: string
  createdAt: string
}
export interface PrototypeDatabase {
  projectCodeCounters?: Record<string, number>
  schemaVersion: 2
  users: DemoUser[]
  demands: DemoDemand[]
  projects: DemoProject[]
  progressUpdates: DemoProgressUpdate[]
  stageHistories: DemoStageHistory[]
  scheduleChanges: DemoScheduleChange[]
  lifecycleEvents: DemoLifecycleEvent[]
}
export interface DemoLifecycleEvent {
  id: string
  entityType: 'project' | 'demand' | 'user'
  entityId: string
  action:
    | 'plan'
    | 'complete'
    | 'cancel'
    | 'archive'
    | 'reopen'
    | 'delete'
    | 'withdraw'
    | 'correct'
    | 'grant'
    | 'revoke'
  authorId: string
  createdAt: string
  reason: string
  before: Record<string, string | number | boolean>
  after: Record<string, string | number | boolean>
}
export interface PrototypeSnapshot {
  schemaVersion: 2
  revision: number
  activeUserId: string
  scenario: PrototypeScenario
  database: PrototypeDatabase
  updatedAt: string
}
