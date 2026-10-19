/**
 * What the sync state looks like in the header.
 *
 * Its own module for two reasons. It is the one place that decides what "syncing"
 * means on screen, which both the provider and the icon need; and it takes the three
 * fields it reads as arguments rather than the whole status, so the provider's memo
 * can depend on exactly what it uses.
 *
 * That narrowness is the point. A cycle that finds both sides already in agreement
 * still changes `lastOutcome` and `lastSyncAt`; depending on the status object would
 * hand the header a new value on every routine check and re-render the icon to
 * produce the identical picture. Three primitives, and a check that finds nothing
 * leaves all three untouched.
 *
 * Kept out of the icon as well, so a fourth state added here changes one function
 * rather than two components that both happen to switch on the same enum.
 */

export type SyncBadgeTone = 'idle' | 'ok' | 'warn' | 'bad'

export interface SyncBadge {
  label: string
  glyph: string
  tone: SyncBadgeTone
  /** The engine's own message where it has one, so the tooltip says something. */
  title: string
}

export function describeSyncBadge(
  connected: boolean,
  state: 'idle' | 'syncing' | 'error',
  pending: boolean,
  message: string | null,
): SyncBadge {
  if (!connected)
    return { label: 'Not connected', glyph: '–', tone: 'idle', title: 'Not connected' }
  if (state === 'syncing') {
    return { label: 'Syncing', glyph: '↻', tone: 'ok', title: message ?? 'Syncing' }
  }
  if (state === 'error') {
    return { label: 'Sync problem', glyph: '!', tone: 'bad', title: message ?? 'Sync problem' }
  }
  if (pending)
    return { label: 'Changes waiting', glyph: '↑', tone: 'warn', title: 'Changes waiting' }
  return { label: 'Synced', glyph: '✓', tone: 'ok', title: 'Synced' }
}
