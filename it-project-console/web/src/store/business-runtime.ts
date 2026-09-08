import type { DemoUser, PrototypeSnapshot, PrototypeDatabase } from '@/domain/prototype'

// The original prototype bootstrap installs this adapter; production never imports its seeds.
export interface PrototypeDriver {
  load(): PrototypeSnapshot
  reset(userId?: string): PrototypeSnapshot
  transact(mutator: (snapshot: PrototypeSnapshot) => void): PrototypeSnapshot
  database(snapshot: PrototypeSnapshot): PrototypeDatabase
  defaultUser: DemoUser
  isDataError(error: unknown): boolean
}
let driver: PrototypeDriver | undefined
export function configurePrototypeDriver(value: PrototypeDriver) {
  driver = value
}
export function getPrototypeDriver() {
  return driver
}
