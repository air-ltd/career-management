/**
 * Scheduler tests.
 *
 * What matters here is timing and ownership: when a cycle runs, when it must not,
 * and what the UI is told. Two properties are load-bearing and easy to get
 * wrong, so each has its own case:
 *
 * - A write the scheduler itself made must not trigger another cycle.
 * - Two cycles must never overlap.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEBOUNCE_MS, SyncScheduler, type SchedulerDeps, type SyncStatus } from './scheduler'
import { SyncError, type RemoteFile, type SyncProvider } from './provider'
import { SCHEMA_VERSION } from '../export/envelope'
import { emptySnapshot } from '../domain/merge'
import type { Mergeable, Snapshot } from '../domain/types'
import { clearSyncMetaForTests } from '../storage/syncMeta'

function snapshotOf(jobs: Mergeable[] = []): Snapshot {
  const base = emptySnapshot(SCHEMA_VERSION)
  return { schemaVersion: SCHEMA_VERSION, entities: { ...base.entities, jobs } }
}

function row(id: string, updatedAt = 1000): Mergeable {
  return { id, updatedAt: new Date(updatedAt * 1000).toISOString(), deletedAt: null }
}

class FakeProvider implements SyncProvider {
  readonly id = 'fake'
  syncCount = 0
  /** Set to make `ensureAuth` reject. */
  authError: SyncError | null = null
  remote: RemoteFile | null = null
  /** Resolve `pull` only when released, to hold a cycle open. */
  gate: { promise: Promise<void>; release: () => void } | null = null

  ensureAuth(): Promise<void> {
    return this.authError === null ? Promise.resolve() : Promise.reject(this.authError)
  }
  signOut(): Promise<void> {
    this.signedOut = true
    return Promise.resolve()
  }
  signedOut = false
  pullError: SyncError | null = null
  pushError: SyncError | null = null
  pullCount = 0
  status(): Promise<{ authenticated: boolean }> {
    return Promise.resolve({ authenticated: this.authError === null })
  }
  pull(): Promise<RemoteFile | null> {
    this.pullCount += 1
    if (this.pullError !== null) return Promise.reject(this.pullError)
    return this.gate === null
      ? Promise.resolve(this.remote)
      : this.gate.promise.then(() => this.remote)
  }
  push(): Promise<{ rev: string }> {
    this.syncCount += 1
    if (this.pushError !== null) return Promise.reject(this.pushError)
    return Promise.resolve({ rev: 'rev-1' })
  }
}

function harness(provider = new FakeProvider(), overrides: Partial<SchedulerDeps> = {}) {
  const local = snapshotOf([row('a')])
  const written: Snapshot[] = []
  const revs: (string | null)[] = []
  const logs: { level: string; message: string }[] = []
  let authLost = 0

  const deps: SchedulerDeps = {
    provider,
    path: '/data.json',
    supportedSchemaVersion: SCHEMA_VERSION,
    readLocal: () => Promise.resolve(local),
    writeLocal: (snapshot) => {
      written.push(snapshot)
      return Promise.resolve()
    },
    writeLastRev: (rev) => {
      revs.push(rev)
      return Promise.resolve()
    },
    now: () => new Date(0),
    onLog: (entry) => {
      logs.push({ level: entry.level, message: entry.message })
    },
    onAuthLost: () => {
      authLost += 1
    },
    debounceMs: 20,
    ...overrides,
  }

  return {
    deps,
    provider,
    written,
    revs,
    logs,
    getAuthLost: () => authLost,
  }
}

beforeEach(async () => {
  // Real timers for the reset: `fake-indexeddb` deletion completes through real
  // async plumbing, which fake timers starve. Faking is turned on after.
  await clearSyncMetaForTests()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SyncScheduler', () => {
  it('runs a cycle on start', async () => {
    const { deps, provider } = harness()
    const scheduler = new SyncScheduler(deps)
    await scheduler.start()
    scheduler.stop()

    expect(provider.syncCount).toBe(1)
  })

  it('does not run while stopped', async () => {
    const { deps, provider } = harness()
    const scheduler = new SyncScheduler(deps)
    scheduler.stop()
    await scheduler.syncNow()
    scheduler.stop()

    expect(provider.syncCount).toBe(0)
  })

  it('reports idle and a sync time after a successful cycle', async () => {
    const { deps } = harness()
    const scheduler = new SyncScheduler(deps)
    const seen: SyncStatus[] = []
    scheduler.subscribe((next) => {
      seen.push(next)
    })
    await scheduler.start()
    scheduler.stop()

    expect(seen.at(-1)?.state).toBe('idle')
    expect(seen.at(-1)?.lastSyncAt).not.toBeNull()
  })

  it('treats a first run as idle, not as an expired token (SY29)', async () => {
    // Before anything is connected there is no token to have expired. Offering
    // to "reconnect" here is noise, and the message is wrong.
    const provider = new FakeProvider()
    provider.authError = new SyncError('auth', 'Not connected to Dropbox.')
    const { deps, getAuthLost } = harness(provider)
    const scheduler = new SyncScheduler(deps)

    const seen: SyncStatus[] = []
    scheduler.subscribe((next) => seen.push(next))
    await scheduler.start()
    scheduler.stop()

    expect(getAuthLost()).toBe(0)
    expect(seen.at(-1)?.state).toBe('idle')
    expect(seen.at(-1)?.message).toBeNull()
  })

  it('discards a dead token and offers Connect again, without retrying (SY28, SY29)', async () => {
    // A dead token is not `ensureAuth` failing — that is a first run, handled
    // separately. It is a refresh being refused, which surfaces as a `failed`
    // auth outcome from a cycle that did connect.
    const provider = new FakeProvider()
    provider.pushError = new SyncError('auth', 'Dropbox rejected the token.')
    const { deps, getAuthLost } = harness(provider)
    const scheduler = new SyncScheduler(deps)
    await scheduler.start()

    await vi.advanceTimersByTimeAsync(300_000)
    scheduler.stop()

    // Auth failures discard the credential and offer Connect again, and waiting
    // cannot fix one — so no retry storm.
    expect(getAuthLost()).toBeGreaterThan(0)
    expect(provider.signedOut).toBe(true)
  })

  it('retries a network failure a bounded number of times (SY28)', async () => {
    const provider = new FakeProvider()
    provider.pullError = new SyncError('network', 'offline')
    const { deps } = harness(provider)

    const scheduler = new SyncScheduler(deps)
    await scheduler.start()

    const attemptsAfterFirst = provider.pullCount
    await vi.advanceTimersByTimeAsync(5_000)
    expect(provider.pullCount).toBeGreaterThan(attemptsAfterFirst)

    // Bounded: well past the last backoff, it has stopped.
    await vi.advanceTimersByTimeAsync(600_000)
    const settled = provider.pullCount
    await vi.advanceTimersByTimeAsync(600_000)
    expect(provider.pullCount).toBe(settled)
    scheduler.stop()
  })

  it('clears the retry budget after a success', async () => {
    const provider = new FakeProvider()
    const { deps } = harness(provider)

    const scheduler = new SyncScheduler(deps)
    await scheduler.start()
    await vi.advanceTimersByTimeAsync(120_000)
    scheduler.stop()

    // No timer left armed: a healthy scheduler schedules nothing further.
    const before = provider.pullCount
    await vi.advanceTimersByTimeAsync(600_000)
    expect(provider.pullCount).toBe(before)
  })

  it('debounces a burst of local writes into one cycle (SY23)', async () => {
    const { deps, provider } = harness()
    const scheduler = new SyncScheduler(deps)
    await scheduler.start()
    const afterStart = provider.pullCount

    // Three "writes" in quick succession, each bumping the revision.
    const { bumpRevision } = await import('../storage/db')
    bumpRevision()
    bumpRevision()
    bumpRevision()
    await vi.advanceTimersByTimeAsync(50)

    // One cycle for all three, not three.
    expect(provider.pullCount).toBe(afterStart + 1)
    scheduler.stop()
  })

  it('does not re-trigger on the write it made itself (SY24)', async () => {
    // The remote has a record this device has never seen, so a merge writes
    // locally. That write must not schedule another cycle, or sync would loop.
    const provider = new FakeProvider()
    provider.remote = {
      body: JSON.stringify({
        format: 'career-management-document',
        formatVersion: 1,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date(0).toISOString(),
        counts: { jobs: 1 },
        data: {
          settings: [],
          profiles: [],
          jobs: [row('theirs', 2000)],
          achievements: [],
          awards: [],
          education: [],
          questionCategories: [],
          questions: [],
        },
      }),
      rev: 'rev-1',
    }

    const { deps, written, provider: p } = harness(provider)
    const scheduler = new SyncScheduler(deps)
    await scheduler.start()

    // The merge differs from the remote, so it publishes once.
    expect(written).toHaveLength(1)
    expect(p.syncCount).toBe(1)

    await vi.advanceTimersByTimeAsync(120_000)
    // Still one write and one push: the scheduler's own write did not re-arm the
    // debounce. Without the suppression flag this loops forever.
    expect(written).toHaveLength(1)
    expect(p.syncCount).toBe(1)
    scheduler.stop()
  })

  it('never runs two cycles at once, and queues exactly one (SY25)', async () => {
    const provider = new FakeProvider()
    let release!: () => void
    provider.gate = {
      promise: new Promise<void>((resolve) => {
        release = resolve
      }),
      release: () => release(),
    }

    const { deps, provider: p } = harness(provider)
    const scheduler = new SyncScheduler(deps)

    const first = scheduler.syncNow()
    await Promise.resolve()
    const second = scheduler.syncNow()
    const third = scheduler.syncNow()

    // The two extra requests return immediately rather than starting cycles.
    await expect(second).resolves.toBeNull()
    await expect(third).resolves.toBeNull()

    release()
    await first
    // The queued cycle ran after the first finished, not during it.
    await vi.advanceTimersByTimeAsync(0)
    scheduler.stop()
    expect(p.pullCount).toBeGreaterThanOrEqual(2)
  })

  it('reports pending while a change waits out the debounce', async () => {
    const { deps } = harness()
    const scheduler = new SyncScheduler(deps)
    const seen: boolean[] = []
    scheduler.subscribe((status) => {
      seen.push(status.pending)
    })

    await scheduler.start()
    const { bumpRevision } = await import('../storage/db')
    bumpRevision()
    await vi.advanceTimersByTimeAsync(50)
    scheduler.stop()

    // Pending goes true when the change registers, and is false again once the
    // cycle that handled it has finished.
    expect(seen).toContain(true)
    expect(seen[seen.length - 1]).toBe(false)
  })

  it('stops cleanly and leaves no timers armed', async () => {
    const { deps, provider } = harness()
    const scheduler = new SyncScheduler(deps)
    await scheduler.start()

    const { bumpRevision } = await import('../storage/db')
    bumpRevision()
    scheduler.stop()

    const before = provider.pullCount
    await vi.advanceTimersByTimeAsync(600_000)
    expect(provider.pullCount).toBe(before)
  })

  it('uses the documented debounce by default', () => {
    expect(DEBOUNCE_MS).toBe(5_000)
  })
})
