/**
 * The sync cycle.
 *
 * Reads the local document, reads the remote one, merges, and publishes if the
 * merge is different from what is already there. It knows nothing about Dropbox;
 * everything provider-specific is behind `SyncProvider`.
 */

import {
  canonicalStringify,
  collapseSingletons,
  mergeSnapshots,
  repairReferences,
} from '../domain/merge'
import {
  SCHEMA_VERSION,
  parseEnvelope,
  serialiseEnvelope,
  toEnvelope,
} from '../export/envelope'
import { SyncError, type SyncProvider } from './provider'
import { repairUnusableIds } from '../domain/repair'
import { newId } from '../storage/repository'
import type { Snapshot } from '../domain/types'
import { narrowTables } from '../export/envelope'

export interface SyncLogEntry {
  at: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface SyncDeps {
  provider: SyncProvider
  path: string
  supportedSchemaVersion: number
  readLocal: () => Promise<Snapshot>
  writeLocal: (snapshot: Snapshot) => Promise<void>
  /**
   * Write-only. Deliberately.
   *
   * An earlier version compared this against the pulled revision to decide
   * whether to publish, which cannot distinguish "nothing happened anywhere" from
   * "only this device changed" — a local-only change leaves the remote revision
   * untouched. Local edits and deletions then silently never synced at all.
   */
  writeLastRev: (rev: string | null) => Promise<void>
  now: () => Date
  onLog?: (event: SyncLogEntry) => void
  /**
   * Invoked once the cycle has found something to publish and is about to.
   *
   * The one moment "syncing" can be shown truthfully. Before it a cycle may still
   * conclude that both sides already agree, and advertising a sync for that is how
   * the header comes to flash "Syncing" over a check that changed nothing at all.
   */
  onBeforePublish?: () => void
  /** The id source used to repair unusable records. Injected for testability. */
  makeId?: () => string
}

export type SyncOutcome =
  | { status: 'skipped'; reason: 'not-authenticated' }
  | { status: 'pushed'; rev: string; merged: boolean }
  | { status: 'up-to-date' }
  | { status: 'blocked'; reason: 'unsupported-schema'; message: string }
  | { status: 'failed'; message: string; kind: SyncError['kind'] }

const MAX_ATTEMPTS = 3
const BACKOFF_MS = 500

export async function runSync(deps: SyncDeps): Promise<SyncOutcome> {
  try {
    try {
      await deps.provider.ensureAuth()
    } catch (error) {
      // Not signed in is a normal state, not a failure: the app is local-first
      // and everything works without a connection (SY2, SY3). The reason is
      // logged but deliberately not surfaced — "you are not connected" is the
      // whole of it, and repeating whatever the provider said helps nobody.
      const reason = error instanceof SyncError ? error.kind : 'unknown'
      log(deps, 'warn', `Not signed in to the sync provider (${reason}); continuing locally.`)
      return { status: 'skipped', reason: 'not-authenticated' }
    }

    const local = await deps.readLocal()

    let remote
    try {
      remote = await deps.provider.pull(deps.path)
    } catch (error) {
      if (error instanceof SyncError && error.kind === 'not-found') {
        remote = null
      } else {
        throw error
      }
    }

    // First run: there is nothing to merge with, so publish what is here.
    if (!remote) {
      deps.onBeforePublish?.()
      const rev = await pushWithRetry(deps, local, null)
      await deps.writeLastRev(rev)
      log(deps, 'info', 'Published the local document as the first remote copy.')
      return { status: 'pushed', rev, merged: false }
    }

    // A body that is not JSON at all is still "a file we do not understand", and
    // must be refused rather than interpreted. Letting `JSON.parse` throw would
    // report it as a transient failure and invite a retry against the same file.
    let rawBody: unknown
    try {
      rawBody = JSON.parse(remote.body)
    } catch {
      const message = 'The remote file is not a readable document.'
      log(deps, 'error', message)
      return { status: 'blocked', reason: 'unsupported-schema', message }
    }

    const parsed = parseEnvelope(rawBody, deps.supportedSchemaVersion)
    if (!parsed.ok) {
      /**
       * Refuse rather than interpret. Publishing over the top would destroy
       * whatever is actually on the remote, which is the one copy the user may
       * not have locally.
       */
      log(deps, 'error', `Remote document could not be read: ${parsed.message}`)
      return { status: 'blocked', reason: 'unsupported-schema', message: parsed.message }
    }

    const remoteSnapshot = parsed.snapshot

    const outcome = mergeSnapshots(local, remoteSnapshot, deps.supportedSchemaVersion)
    if (!outcome.ok) {
      const message = `The remote document uses layout version ${String(outcome.remoteSchemaVersion)}, but this version understands up to ${String(outcome.supportedSchemaVersion)}.`
      log(deps, 'error', message)
      return { status: 'blocked', reason: 'unsupported-schema', message }
    }

    // Repaired *before* anything is written or published. Writing the unrepaired
    // merge locally and publishing the repaired one leaves the database and the
    // remote holding different data, so every subsequent cycle finds a difference
    // and pushes a redundant correction — forever.
    //
    // Ids first, then references: a record that has just been given an id may be
    // the one another record was pointing at, and clearing a reference before
    // restoring the target would throw away a link that was actually fine.
    const identified = repairUnusableIds(outcome.merged, deps.makeId ?? newId)
    if (identified.repaired.length > 0) {
      log(
        deps,
        'warn',
        `Gave ${String(identified.repaired.length)} record(s) a new id so they can be edited and merged: ${identified.repaired
          .map((entry) => entry.table)
          .join(', ')}. Nothing else about them was changed.`,
      )
    }
    if (identified.unrepairable.length > 0) {
      log(
        deps,
        'error',
        `${String(identified.unrepairable.length)} record(s) have no usable id and could not be given one. They cannot be edited until this is resolved.`,
      )
    }
    const merged = repairReferences(collapseSingletons(identified.snapshot))

    /**
     * Written unconditionally, *before* the publish decision.
     *
     * This is what makes the device converge on the union. Deciding whether to
     * write first and skipping this whenever there was "nothing to publish" is
     * how a device ends up permanently missing records that only ever existed on
     * another one, while every cycle cheerfully reports agreement.
     */
    await deps.writeLocal(merged)

    /**
     * The publish decision is by **content**, not by revision (SY26).
     *
     * A local edit, addition or deletion leaves the remote revision untouched, so
     * comparing revisions concludes there is nothing to do and local-only changes
     * never reach the provider at all — which is exactly how deleting a record
     * left it sitting in Dropbox unchanged.
     */
    if (canonicalStringify(merged) === canonicalStringify(remoteSnapshot)) {
      await deps.writeLastRev(remote.rev)
      log(deps, 'info', 'Local and remote are in agreement; nothing to publish.')
      return { status: 'up-to-date' }
    }

    deps.onBeforePublish?.()

    const rev = await pushWithRetry(deps, merged, remote.rev)
    await deps.writeLastRev(rev)
    log(deps, 'info', 'Merged changes and published local data.')
    return { status: 'pushed', rev, merged: true }
  } catch (error) {
    // Every path above leaves local data untouched, which is the local-first
    // guarantee (SY1). A failure here costs a sync, never a record.
    const message = error instanceof Error ? error.message : 'Unknown error'
    const kind = error instanceof SyncError ? error.kind : 'unknown'
    log(deps, 'error', `Sync failed: ${message}`)
    return { status: 'failed', message, kind }
  }
}

/**
 * Push, with bounded retries.
 *
 * On a conflict this does **not** retry the same push — that would clobber
 * whoever wrote first. It re-reads, re-merges and pushes against the fresh
 * revision.
 */
async function pushWithRetry(
  deps: SyncDeps,
  snapshot: Snapshot,
  expectedRev: string | null,
): Promise<string> {
  let rev = expectedRev
  let current = snapshot

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await delay(BACKOFF_MS * attempt)

    const body = serialiseEnvelope(toEnvelope(current, deps.now()))

    try {
      const result = await deps.provider.push(deps.path, body, rev)
      return result.rev
    } catch (error) {
      const isConflict = error instanceof SyncError && error.kind === 'conflict'
      const retryable = error instanceof SyncError && error.retryable
      if (!isConflict && !retryable) throw error
      if (attempt === MAX_ATTEMPTS - 1) throw error

      if (isConflict) {
        log(deps, 'warn', 'Remote changed during sync; re-reading and retrying.')
        const fresh = await deps.provider.pull(deps.path)
        if (fresh) {
          const parsed = parseEnvelope(JSON.parse(fresh.body), deps.supportedSchemaVersion)
          if (parsed.ok) {
            /**
             * Re-read local, not the snapshot this cycle started with.
             *
             * That snapshot predates the round trip, so anything the user saved
             * while the network was in flight would be neither merged nor pushed —
             * and "Sync now" would report success while omitting the record added
             * a second earlier.
             */
            const freshLocal = await deps.readLocal()
            const outcome = mergeSnapshots(
              freshLocal,
              parsed.snapshot,
              deps.supportedSchemaVersion,
            )
            if (outcome.ok) {
              current = repairReferences(collapseSingletons(outcome.merged))
              await deps.writeLocal(current)
            }
          }
          rev = fresh.rev
        }
      }
    }
  }

  throw new SyncError('network', 'Push did not succeed after retrying')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function log(deps: SyncDeps, level: SyncLogEntry['level'], message: string): void {
  deps.onLog?.({ at: deps.now().toISOString(), level, message })
}

/**
 * Drop records that fail their own entity schema.
 *
 * Exposed so the caller can report them rather than discover a silently missing
 * record later. A record the app cannot read is a question for the user.
 */
export function filterInvalidRecords(snapshot: Snapshot) {
  return narrowTables(snapshot)
}

export { SCHEMA_VERSION }
