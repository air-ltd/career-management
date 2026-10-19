import { createContext, useContext } from 'react'
import type { SyncBadge } from './syncBadge'
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

/**
 * What the header's sync icon needs, and nothing else.
 *
 * A cycle that finds both sides already in agreement still changes `lastOutcome`
 * and `lastSyncAt`, which recreates the main context's value and re-renders every
 * consumer of it — including the header icon, whose output is identical either way.
 * A re-render is not by itself a flash, but a component that re-renders on a timer
 * nobody asked for is the kind of thing that flickers when something else goes
 * wrong, and the fix is cheap: give the icon a slice that only changes when the icon
 * changes.
 *
 * Split out rather than narrowed, because the sync page legitimately needs the whole
 * status and this cannot make that cheaper for it.
 */
export const SyncBadgeContext = createContext<SyncBadge | null>(null)

export const SyncContext = createContext<SyncContextValue | null>(null)

/** The header's slice of the sync state. Throws outside a provider, as `useSync` does. */
export function useSyncBadge(): SyncBadge {
  const value = useContext(SyncBadgeContext)
  if (value === null) {
    throw new Error('useSyncBadge must be used inside a SyncProvider')
  }
  return value
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext)
  if (value === null) {
    throw new Error('useSync must be used inside a SyncProvider')
  }
  return value
}

export type { SyncBadge, SyncLogEntry, SyncOutcome, SyncStatus }
