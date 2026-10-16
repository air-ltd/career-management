import { createContext, useContext } from 'react'
import type { SyncLogEntry, SyncStatus } from '../../sync/scheduler'
import type { SyncOutcome } from '../../sync/engine'
import type { Environment } from '../../sync/appKey'

/**
 * Sync state, shared by everything that shows it.
 *
 * In its own module rather than beside the provider so that exporting `useSync`
 * from the same file as a component does not break React Fast Refresh — the
 * rule that a module exporting components may not also export hooks.
 */
export interface SyncContextValue {
  status: SyncStatus
  /** The manual "Sync now" action. */
  syncNow: () => void
  /** Drop the credential and offer Connect again. */
  signOut: () => Promise<void>
  connect: () => Promise<void>
  connected: boolean
  environment: Environment
  log: SyncLogEntry[]
}

export const SyncContext = createContext<SyncContextValue | null>(null)

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext)
  if (value === null) {
    throw new Error('useSync must be used inside a SyncProvider')
  }
  return value
}

export type { SyncLogEntry, SyncOutcome, SyncStatus }
