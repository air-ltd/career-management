/**
 * When sync runs, and what the UI is told about it.
 *
 * The engine in `engine.ts` knows how to reconcile; this decides *when* and
 * reports progress. The two are separate so that the reconciliation logic — the
 * highest-risk code in the project — can be tested with no timers, no DOM and no
 * provider.
 */

import { runSync, type SyncOutcome } from './engine'
import { SyncError, type SyncProvider } from './provider'
import { bumpRevision, subscribeToRevision } from '../storage/db'
import { writeSyncMeta } from '../storage/syncMeta'
import type { Snapshot } from '../domain/types'

/** Local edits are batched before they are pushed. */
export const DEBOUNCE_MS = 5_000

/**
 * Transient failures are retried on this schedule and no longer.
 *
 * `auth` and `scope-missing` are deliberately absent: waiting cannot fix a
 * rejected token, so re-arming would spend requests to arrive at the same answer
 * and would re-arm every time a token turned out to be dead.
 */
const RETRY_BACKOFF_MS = [5_000, 30_000, 120_000] as const

export type SyncState = 'idle' | 'syncing' | 'error'

export interface SyncStatus {
  state: SyncState
  lastOutcome: SyncOutcome | null
  lastSyncAt: string | null
  lastRev: string | null
  message: string | null
  /** A change is waiting out the debounce window, or a cycle is queued. */
  pending: boolean
}

export interface SyncLogEntry {
  at: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface SchedulerDeps {
  provider: SyncProvider
  path: string
  supportedSchemaVersion: number
  readLocal: () => Promise<Snapshot>
  writeLocal: (snapshot: Snapshot) => Promise<void>
  writeLastRev: (rev: string | null) => Promise<void>
  now: () => Date
  onLog?: (entry: SyncLogEntry) => void
  /** The stored credential stopped working; the UI must offer Connect again. */
  onAuthLost?: () => void
  debounceMs?: number
}

const NO_OUTCOME_MESSAGE =
  'Dropbox sign-in has expired or is no longer valid, so sync is paused. Your data is safe in this browser — reconnect to carry on syncing.'

export class SyncScheduler {
  private readonly deps: SchedulerDeps
  private readonly debounceMs: number

  private status: SyncStatus = {
    state: 'idle',
    lastOutcome: null,
    lastSyncAt: null,
    lastRev: null,
    message: null,
    pending: false,
  }

  private readonly listeners = new Set<(status: SyncStatus) => void>()

  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private stopped = false

  private running = false
  private queuedWhileRunning = false

  /**
   * Whether the revision bump we are seeing is one we caused.
   *
   * A flag rather than a revision comparison: a user write that lands *during* a
   * cycle must still be noticed, and the two are indistinguishable by revision
   * number. Only asking who caused it works.
   */
  private writingLocally = false

  /**
   * Whether a change is outstanding.
   *
   * Separate from `pending` because `pending` is cleared when a cycle *starts*,
   * while this stays true until the work is actually done. Clearing it on start
   * would leave the indicator reading "not pending" for the whole duration of the
   * cycle, which is the one window it exists to describe.
   */
  private workOutstanding = false

  private unsubscribeRevision: (() => void) | null = null
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void this.syncNow()
  }
  private readonly onPageHide = () => {
    void this.syncNow()
  }

  constructor(deps: SchedulerDeps) {
    this.deps = deps
    this.debounceMs = deps.debounceMs ?? DEBOUNCE_MS

    // Wrapped once, here, so every write the engine performs is marked as ours
    // and does not re-trigger the cycle that caused it.
    const writeLocal = deps.writeLocal
    this.deps = {
      ...deps,
      writeLocal: (snapshot: Snapshot) => {
        this.writingLocally = true
        try {
          return writeLocal(snapshot)
        } finally {
          // `finally`, not a success path: a failed merge write must also stop
          // suppressing, or every later user write would be swallowed.
          queueMicrotask(() => {
            this.writingLocally = false
          })
        }
      },
    }
  }

  // ------------------------------------------------------------------ status

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch }
    for (const listener of this.listeners) listener(this.status)
  }

  getStatus(): SyncStatus {
    return this.status
  }

  // ---------------------------------------------------------------- triggers

  /**
   * Begin syncing, and stop reacting to changes.
   *
   * Every listener and timer is cleared, not just the debounce one: leaving the
   * retry timer armed after a disconnect is how a stopped scheduler keeps
   * spending the user's Dropbox quota.
   */
  async start(): Promise<void> {
    this.stopped = false

    this.unsubscribeRevision = subscribeToRevision(() => {
      if (this.writingLocally) return
      this.schedule()
    })

    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('pagehide', this.onPageHide)

    await this.syncNow()
  }

  stop(): void {
    this.stopped = true
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.unsubscribeRevision?.()
    this.unsubscribeRevision = null
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('pagehide', this.onPageHide)
  }

  /**
   * Ask for a cycle.
   *
   * A trailing-edge debounce: every write resets the timer. Typing produces one
   * push, not one per keystroke.
   */
  schedule(): void {
    if (this.stopped) return
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)

    this.workOutstanding = true
    this.emit({ pending: true })

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.syncNow()
    }, this.debounceMs)
  }

  /**
   * Run a cycle now, or queue one if one is already running.
   *
   * `runSync` is not re-entrant and never will be — it reads the whole document,
   * pushes the whole document, and two of those interleaving would produce a
   * merge of a merge.
   */
  async syncNow(): Promise<SyncOutcome | null> {
    if (this.stopped) return null

    if (this.running) {
      this.queuedWhileRunning = true
      return null
    }

    this.running = true

    try {
      const outcome = await runSync(this.engineDeps())
      this.applyOutcome(outcome)
      return outcome
    } finally {
      this.running = false
      if (!this.workOutstanding) this.emit({ pending: false })

      if (this.queuedWhileRunning) {
        this.queuedWhileRunning = false
        void this.syncNow()
      }
    }
  }

  private engineDeps() {
    return {
      provider: this.deps.provider,
      path: this.deps.path,
      supportedSchemaVersion: this.deps.supportedSchemaVersion,
      readLocal: this.deps.readLocal,
      writeLocal: this.deps.writeLocal,
      writeLastRev: this.deps.writeLastRev,
      now: this.deps.now,
      ...(this.deps.onLog ? { onLog: this.deps.onLog } : {}),
      // Announce the sync here rather than when the cycle begins: a cycle that
      // finds both sides already in agreement has nothing to sync, and saying
      // otherwise makes the indicator flicker over every routine check.
      onBeforePublish: () => {
        this.emit({ state: 'syncing', pending: this.workOutstanding })
      },
    }
  }

  // ---------------------------------------------------------------- outcomes

  private applyOutcome(outcome: SyncOutcome): void {
    const log = (level: 'info' | 'warn' | 'error', message: string) =>
      this.deps.onLog?.({ at: this.deps.now().toISOString(), level, message })

    // A skipped cycle means there is no usable credential. On a first run there
    // simply is not one, which is not a dead token — offering to "reconnect"
    // before the user has ever connected is noise, and discarding a credential
    // that was never set is harmless but the message is wrong.
    //
    // A genuine dead token looks the same here, so the distinction is whether a
    // credential was ever stored. The caller knows; the scheduler asks.
    if (outcome.status === 'skipped') {
      log('info', 'Not connected to Dropbox yet; sync is paused.')
      this.emit({ state: 'idle', lastOutcome: outcome, message: null, pending: false })
      return
    }

    const tokenUnusable = outcome.status === 'failed' && isAuthFailure(outcome.kind)

    if (tokenUnusable) {
      /*
       * Only reachable once a connection has been made: the scheduler only runs
       * after the user connects, so "not signed in" arriving here as a *failure*
       * is a dead token rather than a first run.
       *
       * Discarding it is what makes the Connect button come back. An earlier
       * version emitted a `disabled` state that no view rendered, so the app sat
       * showing a green "synced" for a connection that no longer existed.
       */
      log('warn', 'The saved Dropbox token stopped working; discarded it so you can reconnect.')
      void this.deps.provider.signOut()
      this.deps.onAuthLost?.()
      this.emit({ state: 'error', message: NO_OUTCOME_MESSAGE, pending: false })
      return
    }

    this.workOutstanding = false

    if (outcome.status === 'pushed' || outcome.status === 'up-to-date') {
      const at = this.deps.now().toISOString()
      void writeSyncMeta('lastSyncAt', at)
      this.emit({
        state: 'idle',
        lastOutcome: outcome,
        lastSyncAt: at,
        message: null,
        pending: false,
      })
      this.clearRetry()
      return
    }

    if (outcome.status === 'blocked') {
      // Not a transient failure. Retrying will not help and the user has to act.
      log('error', outcome.message)
      this.emit({
        state: 'error',
        lastOutcome: outcome,
        message: outcome.message,
        pending: false,
      })
      this.clearRetry()
      return
    }

    const { kind, message } = outcome

    if (kind === 'scope-missing') {
      this.emit({
        state: 'error',
        lastOutcome: outcome,
        message:
          "Dropbox rejected the app for a missing permission. Check the app's permissions and redirect URI in the Dropbox App Console match the Connect screen, then connect again.",
        pending: false,
      })
      this.clearRetry()
      return
    }

    log('error', `Sync failed: ${message}`)
    this.emit({ state: 'error', lastOutcome: outcome, message, pending: false })

    // `conflict` is deliberately not retried here: it is handled inside the
    // cycle, so reaching here means that handling was exhausted, which is not
    // the kind of failure that clears itself.
    if (isTransientFailure(kind)) this.armRetry()
    else this.clearRetry()
  }

  // ----------------------------------------------------------------- retries

  private armRetry(): void {
    if (this.retryCount >= RETRY_BACKOFF_MS.length) return
    const delay = RETRY_BACKOFF_MS[this.retryCount]
    this.retryCount += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.syncNow()
    }, delay)
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.retryCount = 0
  }
}

/**
 * Whether the failure means the token is no longer usable.
 *
 * A missing scope is *not* one of these. The token is fine; the Dropbox app has
 * not been granted the permission it needs, and discarding the token would send
 * the user to reconnect to the same app and hit the same wall. It is handled on
 * its own below, where the message can say where to look.
 */
function isAuthFailure(kind: string): boolean {
  return kind === 'auth'
}

function isTransientFailure(kind: string): boolean {
  return kind === 'network' || kind === 'rate-limited'
}

export { bumpRevision, SyncError }
