/**
 * What each sync state looks like in the header.
 *
 * Separate from the icon because this is the part that decides, and it is the part
 * that was wrong once already: the icon said "Syncing" the moment a cycle *began*,
 * before the cycle knew whether there was anything to sync, which made every routine
 * check — the tab coming forward, the page being hidden — flash a state that was not
 * true. A test on the presentation would have caught the wording; this catches the
 * meaning.
 */

import { describe, expect, it } from 'vitest'
import { describeSyncBadge } from './syncBadge'
import type { SyncState } from '../../sync/scheduler'

/** The four fields the header reads, defaulted to a quiet, connected, idle app. */
const badge = (
  connected: boolean,
  over: { state?: SyncState; pending?: boolean; message?: string | null } = {},
) =>
  describeSyncBadge(
    connected,
    over.state ?? 'idle',
    over.pending ?? false,
    over.message ?? null,
  )

describe('describeSyncBadge', () => {
  it('says not connected before anything else, even mid-sync', () => {
    // An unconnected app has nothing to sync, so it is never "syncing" whatever a
    // status that says otherwise implies.
    expect(badge(false, { state: 'syncing', pending: true })).toMatchObject({
      label: 'Not connected',
      tone: 'idle',
    })
  })

  it('shows the engine message in preference to the plain label', () => {
    expect(badge(true, { state: 'error', message: 'Rate limited' }).title).toBe('Rate limited')
    // ...but not when there is none, so the tooltip is never blank.
    expect(badge(true).title).toBe('Synced')
  })

  it('gives each state a distinct glyph, so the icon is not colour alone', () => {
    const states = [
      badge(false),
      badge(true, { state: 'syncing' }),
      badge(true, { state: 'error' }),
      badge(true, { pending: true }),
      badge(true),
    ]
    const glyphs = states.map((badge) => badge.glyph)
    expect(new Set(glyphs).size).toBe(glyphs.length)
    expect(states.map((badge) => badge.label)).toEqual([
      'Not connected',
      'Syncing',
      'Sync problem',
      'Changes waiting',
      'Synced',
    ])
  })

  it('prefers a sync problem over changes waiting, which it is a cause of', () => {
    expect(badge(true, { state: 'error', pending: true }).label).toBe('Sync problem')
  })
})
