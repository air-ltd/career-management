/**
 * Sync cycle tests.
 *
 * Each case is a real failure mode from the reference project's history, or a
 * way the cycle can quietly do the wrong thing while reporting success.
 */

import { describe, expect, it } from 'vitest'
import { runSync, type SyncDeps } from './engine'
import { SyncError, type RemoteFile, type SyncProvider } from './provider'
import { SCHEMA_VERSION, serialiseEnvelope, toEnvelope } from '../export/envelope'
import { emptySnapshot } from '../domain/merge'
import type { Mergeable, Snapshot } from '../domain/types'
import { at, jobRow } from '../test/factories'

const AT = at

function row(id: string, updatedAt: number): Mergeable {
  return jobRow(id, { updatedAt: AT(updatedAt) })
}

function snapshotOf(jobs: Mergeable[]): Snapshot {
  return {
    ...emptySnapshot(SCHEMA_VERSION),
    entities: { ...emptySnapshot(SCHEMA_VERSION).entities, jobs },
  }
}

/** A provider whose every method is a spy, so a test can set exactly one answer. */
class FakeProvider implements SyncProvider {
  readonly id = 'fake'
  pullCount = 0
  pushCount = 0
  lastPush: { body: string; expectedRev: string | null } | null = null
  pushError: SyncError | null = null
  pullError: SyncError | null = null
  remote: RemoteFile | null = null
  authThrows: SyncError | null = null

  // Not `async`: these resolve immediately, and `async` with no `await` is a
  // lint error that would push the fakes toward faking more than they need to.
  ensureAuth(): Promise<void> {
    if (this.authThrows) return Promise.reject(this.authThrows)
    return Promise.resolve()
  }
  signOut(): Promise<void> {
    return Promise.resolve()
  }
  status(): Promise<{ authenticated: boolean }> {
    return Promise.resolve({ authenticated: this.authThrows === null })
  }
  pull(): Promise<RemoteFile | null> {
    this.pullCount += 1
    if (this.pullError) return Promise.reject(this.pullError)
    return Promise.resolve(this.remote)
  }
  push(_path: string, body: string, expectedRev: string | null): Promise<{ rev: string }> {
    this.pushCount += 1
    this.lastPush = { body, expectedRev }
    if (this.pushError) return Promise.reject(this.pushError)
    return Promise.resolve({ rev: 'new-rev' })
  }
}

function harness(local: Snapshot, provider = new FakeProvider()) {
  let written: Snapshot | null = null
  let lastRev: string | null = null

  const deps: SyncDeps = {
    provider,
    path: '/data.json',
    supportedSchemaVersion: SCHEMA_VERSION,
    readLocal: () => Promise.resolve(local),
    writeLocal: (snapshot) => {
      written = snapshot
      return Promise.resolve()
    },
    writeLastRev: (rev) => {
      lastRev = rev
      return Promise.resolve()
    },
    now: () => new Date(0),
  }

  return { deps, provider, getWritten: () => written, getLastRev: () => lastRev }
}

function remoteOf(snapshot: Snapshot, rev: string): RemoteFile {
  return { body: serialiseEnvelope(toEnvelope(snapshot, new Date(0))), rev }
}

/** A remote document with one question whose id is blank — the reported failure. */
function blankIdRemote() {
  return {
    format: 'career-management-document',
    formatVersion: 1,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(0).toISOString(),
    counts: { questions: 1 },
    data: {
      settings: [],
      profiles: [],
      jobs: [],
      achievements: [],
      awards: [],
      education: [],
      questionCategories: [],
      questions: [
        {
          id: '',
          updatedAt: '1970-01-01T00:00:01.000Z',
          deletedAt: null,
          categoryId: 'c1',
          question: 'Why us?',
          answer: 'Because.',
        },
      ],
    },
  }
}

describe('runSync', () => {
  it('skips without failing when not connected, leaving data alone (SY3)', async () => {
    const provider = new FakeProvider()
    provider.authThrows = new SyncError('auth', 'Not connected to Dropbox.')
    const { deps, getWritten } = harness(snapshotOf([row('a', 1)]), provider)

    const outcome = await runSync(deps)
    expect(outcome).toEqual({ status: 'skipped', reason: 'not-authenticated' })
    expect(getWritten()).toBeNull()
  })

  it('publishes on first run when there is nothing remote', async () => {
    const provider = new FakeProvider()
    provider.remote = null
    const { deps, getLastRev } = harness(snapshotOf([row('a', 1)]), provider)

    const outcome = await runSync(deps)
    expect(outcome).toEqual({ status: 'pushed', rev: 'new-rev', merged: false })
    // No revision to update against, so the first write is an overwrite.
    expect(provider.lastPush?.expectedRev).toBeNull()
    expect(getLastRev()).toBe('new-rev')
  })

  it('reports up-to-date and writes nothing when both sides agree', async () => {
    const snapshot = snapshotOf([row('a', 1)])
    const provider = new FakeProvider()
    provider.remote = remoteOf(snapshot, 'rev-1')
    const { deps } = harness(snapshot, provider)

    const outcome = await runSync(deps)
    expect(outcome).toEqual({ status: 'up-to-date' })
    expect(provider.pushCount).toBe(0)
  })

  it('pushes a local-only change, which comparing revisions would have missed (SY26)', async () => {
    // The remote has never been touched, so its revision is unchanged from the
    // last pull. Deciding "anything to do?" by revision concludes no, and the
    // edit never leaves the browser.
    const remoteSnapshot = snapshotOf([])
    const localSnapshot = snapshotOf([row('a', 1)])

    const provider = new FakeProvider()
    provider.remote = remoteOf(remoteSnapshot, 'rev-1')
    const { deps, getWritten } = harness(localSnapshot, provider)

    const outcome = await runSync(deps)
    expect(outcome.status).toBe('pushed')
    expect(provider.pushCount).toBe(1)
    expect(getWritten()?.entities.jobs).toHaveLength(1)
  })

  it('converges on the union when both devices changed', async () => {
    const local = snapshotOf([row('mine', 100)])
    const remote = snapshotOf([row('theirs', 200)])

    const provider = new FakeProvider()
    provider.remote = remoteOf(remote, 'rev-1')
    const { deps, getWritten } = harness(local, provider)

    const outcome = await runSync(deps)
    expect(outcome.status).toBe('pushed')
    expect(
      getWritten()
        ?.entities.jobs.map((r) => r.id)
        .sort(),
    ).toEqual(['mine', 'theirs'])
  })

  it('converges this device onto the union even when there is nothing to publish', async () => {
    // The remote has a record this device has never seen. The local document must
    // gain it regardless of whether the push decision says "up to date".
    const remote = snapshotOf([row('theirs', 200)])
    const provider = new FakeProvider()
    provider.remote = remoteOf(remote, 'rev-1')
    const { deps, getWritten } = harness(snapshotOf([]), provider)

    const outcome = await runSync(deps)
    expect(getWritten()?.entities.jobs.map((r) => r.id)).toEqual(['theirs'])
    expect(outcome.status).toBe('up-to-date')
  })

  it('recovers a remote record with a blank id rather than refusing forever', async () => {
    // The file that produced this failure: one question with an empty id, which
    // the record schema rejects — and which the envelope used to reject too.
    // Refusing made the document permanently unsyncable, because the thing that
    // would fix it was the thing that was blocked.
    const snapshot = snapshotOf([row('mine', 100)])
    const provider = new FakeProvider()
    provider.remote = {
      body: JSON.stringify(blankIdRemote()),
      rev: 'rev-1',
    }
    const { deps, getWritten } = harness(snapshot, provider)

    const outcome = await runSync(deps)

    // It synced, rather than blocking.
    expect(outcome.status).toBe('pushed')

    // The question's text survived, and it got an id so it can be edited.
    const question = getWritten()?.entities['questions']?.[0] as unknown as
      { id: string; question: string; answer: string } | undefined
    expect(question?.question).toBe('Why us?')
    expect(question?.answer).toBe('Because.')
    expect(question?.id).not.toBe('')
    expect(question?.id).toBeTruthy()
  })

  it('says what it repaired, rather than fixing it silently', async () => {
    const provider = new FakeProvider()
    provider.remote = { body: JSON.stringify(blankIdRemote()), rev: 'rev-1' }

    const logs: string[] = []
    const { deps } = harness(snapshotOf([]), provider)
    deps.onLog = (entry) => {
      logs.push(entry.message)
    }

    await runSync(deps)
    expect(logs.some((message) => message.includes('new id'))).toBe(true)
  })

  it('refuses to overwrite a remote file it cannot read', async () => {
    const provider = new FakeProvider()
    provider.remote = { body: 'this is not a document', rev: 'rev-1' }
    const { deps, getWritten } = harness(snapshotOf([row('a', 1)]), provider)

    const outcome = await runSync(deps)
    expect(outcome.status).toBe('blocked')
    if (outcome.status !== 'blocked') return
    expect(outcome.reason).toBe('unsupported-schema')
    // The one thing that must not happen: a push over a file we do not understand.
    expect(provider.pushCount).toBe(0)
    expect(getWritten()).toBeNull()
  })

  it('refuses to push over a remote written by a newer build', async () => {
    const newer = { ...snapshotOf([row('a', 1)]), schemaVersion: SCHEMA_VERSION + 5 }
    const provider = new FakeProvider()
    provider.remote = remoteOf(newer, 'rev-1')
    const { deps } = harness(snapshotOf([]), provider)

    const outcome = await runSync(deps)
    expect(outcome.status).toBe('blocked')
    expect(provider.pushCount).toBe(0)
  })

  it('treats a not-found pull as a first run, not a failure', async () => {
    const provider = new FakeProvider()
    provider.pullError = new SyncError('not-found', 'File not found.')
    const { deps } = harness(snapshotOf([row('a', 1)]), provider)

    const outcome = await runSync(deps)
    expect(outcome.status).toBe('pushed')
  })

  it('reports a failure without touching local data', async () => {
    const provider = new FakeProvider()
    provider.pullError = new SyncError('network', 'offline')
    const { deps, getWritten, getLastRev } = harness(snapshotOf([row('a', 1)]), provider)

    const outcome = await runSync(deps)
    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') return
    expect(outcome.kind).toBe('network')
    expect(getWritten()).toBeNull()
    expect(getLastRev()).toBeNull()
  })

  it('does not retry a rejected token, because waiting cannot fix one', async () => {
    const provider = new FakeProvider()
    provider.pushError = new SyncError('auth', 'rejected')
    const { deps } = harness(snapshotOf([]), provider)

    const outcome = await runSync(deps)
    expect(outcome.status).toBe('failed')
    expect(provider.pushCount).toBe(1)
  })

  it('re-reads and retries on a conflict rather than clobbering (SY27)', async () => {
    const local = snapshotOf([row('mine', 100)])
    const conflictingRemote = snapshotOf([row('theirs', 200)])

    const provider = new FakeProvider()
    provider.remote = remoteOf(conflictingRemote, 'rev-1')

    // Every push loses the race, so the cycle exhausts its attempts. The point is
    // what it did on the way there, not how it ended.
    provider.pushError = new SyncError('conflict', 'The remote file changed.')

    const { deps, getWritten } = harness(local, provider)
    const outcome = await runSync(deps)

    // The retry re-pulled rather than re-sending the same body, and kept both
    // records instead of overwriting whoever wrote first.
    expect(provider.pullCount).toBeGreaterThan(1)
    expect(
      getWritten()
        ?.entities.jobs.map((r) => r.id)
        .sort(),
    ).toEqual(['mine', 'theirs'])
    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') return
    expect(outcome.kind).toBe('conflict')
  })

  it('succeeds when the retry finds a remote that stopped moving', async () => {
    const provider = new FakeProvider()
    provider.remote = remoteOf(snapshotOf([row('theirs', 200)]), 'rev-1')

    let conflicts = 0
    const realPush = provider.push.bind(provider)
    provider.push = async (path, body, expectedRev) => {
      // Fail once, then succeed — the shape of a lost race that resolved.
      if (conflicts === 0) {
        conflicts += 1
        throw new SyncError('conflict', 'The remote file changed.')
      }
      return realPush(path, body, expectedRev)
    }

    const { deps, getWritten } = harness(snapshotOf([row('mine', 100)]), provider)
    const outcome = await runSync(deps)

    expect(outcome.status).toBe('pushed')
    expect(
      getWritten()
        ?.entities.jobs.map((r) => r.id)
        .sort(),
    ).toEqual(['mine', 'theirs'])
  })
})
