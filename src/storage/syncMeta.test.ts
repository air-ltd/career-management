/**
 * The sync metadata.
 *
 * Small, and worth knowing: it is how the sync engine remembers where it got
 * to, and a value it loses is a sync it repeats or a change it misses.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSyncMetaForTests, readSyncMeta, writeSyncMeta } from './syncMeta'

beforeEach(async () => {
  await clearSyncMetaForTests()
})

afterEach(async () => {
  await clearSyncMetaForTests()
})

describe('the sync metadata', () => {
  it('reads back what it was told', async () => {
    await writeSyncMeta('lastRev', '42')
    expect(await readSyncMeta('lastRev')).toBe('42')
  })

  it('says nothing for a key that has never been written', async () => {
    expect(await readSyncMeta('lastSyncAt')).toBeNull()
  })

  it('keeps one key from disturbing the other', async () => {
    await writeSyncMeta('lastRev', '42')
    await writeSyncMeta('lastSyncAt', '2026-10-01T00:00:00.000Z')
    expect(await readSyncMeta('lastRev')).toBe('42')
    expect(await readSyncMeta('lastSyncAt')).toBe('2026-10-01T00:00:00.000Z')
  })

  it('replaces a value rather than keeping both', async () => {
    await writeSyncMeta('lastRev', '42')
    await writeSyncMeta('lastRev', '43')
    expect(await readSyncMeta('lastRev')).toBe('43')
  })
})
