/**
 * Sync state for the React tree.
 *
 * One provider, subscribed once. The scheduler is a plain class with its own
 * listener set; wrapping it here means the rest of the app never constructs one
 * and never learns when a cycle runs.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { SyncScheduler, type SyncLogEntry, type SyncStatus } from '../../sync/scheduler'
import { SyncBadgeContext, SyncContext, type SyncContextValue } from './syncContext'
import { describeSyncBadge } from './syncBadge'
import type { SyncBadge } from './syncContext'
import {
  REMOTE_PATH,
  indexedDbDropboxProvider,
  resetDropboxProvider,
} from '../../sync/providerFactory'
import { SCHEMA_VERSION } from '../../export/envelope'
import { readSnapshot, writeSnapshot } from '../../storage/db'
import { readSyncMeta, writeSyncMeta } from '../../storage/syncMeta'
import { describeKeySource } from '../../sync/appKey'
import { beginAuthCallback } from '../../sync/oauthCallback'

/** The activity log is capped: a long-lived tab must not grow without bound. */
const LOG_LIMIT = 50

export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>({
    state: 'idle',
    lastOutcome: null,
    lastSyncAt: null,
    lastRev: null,
    message: null,
    pending: false,
  })
  const [log, setLog] = useState<SyncLogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const { environment } = describeKeySource()

  const logRef = useRef<SyncLogEntry[]>([])
  const schedulerRef = useRef<SyncScheduler | null>(null)

  const deps = useMemo(
    () => ({
      provider: indexedDbDropboxProvider(),
      path: REMOTE_PATH,
      supportedSchemaVersion: SCHEMA_VERSION,
      readLocal: () => readSnapshot(SCHEMA_VERSION),
      writeLocal: writeSnapshot,
      writeLastRev: (rev: string | null) =>
        rev === null ? Promise.resolve() : writeSyncMeta('lastRev', rev),
      now: () => new Date(),
      onLog: (entry: SyncLogEntry) => {
        // Capped, and held in a ref as well, so a long-lived tab cannot grow
        // without bound. The newest are the useful ones.
        logRef.current = [entry, ...logRef.current].slice(0, LOG_LIMIT)
        setLog(logRef.current)
      },
      onAuthLost: () => {
        setConnected(false)
      },
    }),
    [],
  )

  useEffect(() => {
    const scheduler = new SyncScheduler(deps)
    schedulerRef.current = scheduler

    const unsubscribe = scheduler.subscribe(setStatus)

    // Restore the last known revision and sync time before the first cycle, so
    // the UI has something to show during it rather than flashing "never".
    void (async () => {
      const [rev, lastSyncAt] = await Promise.all([
        readSyncMeta('lastRev'),
        readSyncMeta('lastSyncAt'),
      ])
      setStatus((previous) => ({
        ...previous,
        lastRev: rev,
        lastSyncAt: lastSyncAt ?? previous.lastSyncAt,
      }))
    })()

    // The token may be mid-exchange right now: this provider can be the first
    // thing that runs after an OAuth redirect. Awaiting the memoised callback
    // means one exchange, completed, rather than racing it and reporting "not
    // connected" on a connect that actually worked.
    void (async () => {
      await beginAuthCallback()
      setConnected(await indexedDbDropboxProvider().hasUsableToken())
    })()

    void scheduler.start()

    return () => {
      unsubscribe()
      scheduler.stop()
      schedulerRef.current = null
    }
  }, [deps])

  const value = useMemo<SyncContextValue>(
    () => ({
      status,
      log,
      connected,
      environment,
      syncNow: () => {
        void schedulerRef.current?.syncNow()
      },
      signOut: async () => {
        await indexedDbDropboxProvider().signOut()
        resetDropboxProvider()
        setConnected(false)
      },
      connect: async () => {
        const provider = indexedDbDropboxProvider()
        const state = crypto.randomUUID()
        const { url } = await provider.beginAuth(state)
        window.location.assign(url)
      },
    }),
    [status, log, connected, environment],
  )

  /*
   * The header's slice.
   *
   * Deps are the four things the icon renders from and nothing else, so a cycle
   * that changes nothing visible — which still rewrites `lastOutcome` and
   * `lastSyncAt` — leaves this object identical and the icon unrendered.
   */
  const badge = useMemo<SyncBadge>(
    () => describeSyncBadge(connected, status.state, status.pending, status.message),
    [connected, status.state, status.pending, status.message],
  )

  return (
    <SyncBadgeContext.Provider value={badge}>
      <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
    </SyncBadgeContext.Provider>
  )
}

export type { SyncContextValue }
