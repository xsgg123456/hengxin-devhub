import type { DemoUser } from '@/domain/prototype'
import { isItDepartment } from './it-department'

export const isEngineerEligible = (user: DemoUser): boolean =>
  user.engineerEligible ?? isItDepartment(user.department)
