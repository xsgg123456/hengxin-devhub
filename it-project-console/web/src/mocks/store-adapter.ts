import {
  createBrowserPrototypeRepository,
  PrototypeDataError,
  type PrototypeRepository
} from '@/repositories/prototype-repository'
import { configurePrototypeDriver } from '@/store/business-runtime'
import { DEMO_USERS } from './auth-context'
import { projectScenarioDatabase } from './scenarios'
export function installPrototypeDriver() {
  let repository: PrototypeRepository | undefined
  const repo = () => (repository ??= createBrowserPrototypeRepository())
  configurePrototypeDriver({
    load: () => repo().load(),
    reset: (id) => repo().reset(id),
    transact: (mutator) => repo().transact(mutator),
    database: (snapshot) => projectScenarioDatabase(snapshot.database, snapshot.scenario),
    defaultUser: DEMO_USERS[0],
    isDataError: (error) => error instanceof PrototypeDataError
  })
}
