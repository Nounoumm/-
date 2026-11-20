import { createPrivateHistoryService } from './private-history.js'
import { createAccountShareService } from './account-shares.js'

export function createAccountService(db, options) {
  return { ...createPrivateHistoryService(db, options), shares: createAccountShareService(db) }
}
