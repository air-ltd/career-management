/**
 * The sync indicator in the header.
 *
 * States only, no detail and no actions: the header says whether this device is
 * connected and whether anything is outstanding, and links to the page where the
 * detail and the "Sync now" button live. A control per feature would make the
 * header the place everything goes to hide.
 *
 * An icon rather than a word. The words — "Not connected", "Syncing…", "Sync
 * problem", "Changes waiting", "Synced" — are all the same length of header to hold
 * different lengths of text, and the reason they were in a fixed-width bubble at
 * all was that they reflowed the header every time the status changed. That
 * problem does not exist for an icon, and an icon takes a fraction of the room,
 * which matters now that the header also carries the way to the questions page.
 *
 * The state is carried by a small glyph inside the cloud rather than by colour
 * alone, so the difference survives someone who cannot tell amber from red. The
 * words are still there for anyone who cannot see the header: the link's
 * `aria-label` carries them, and the `title` carries the sync engine's own message
 * where it has one.
 */

import type { SyncStatus } from '../../sync/scheduler'
import { CloudIcon } from '../../app/Icons'
import { useSync } from './syncContext'

export function SyncIndicator() {
  const { status, connected } = useSync()
  const { label, glyph, tone } = describe(connected, status)

  return (
    <a
      className="sync-indicator"
      href="#/sync"
      aria-label={`Sync: ${label}`}
      title={status.message ?? label}
    >
      <CloudIcon size={20} />
      <span className={`sync-badge sync-badge-${tone}`} aria-hidden="true">
        {glyph}
      </span>
    </a>
  )
}

function describe(
  connected: boolean,
  status: SyncStatus,
): {
  label: string
  glyph: string
  tone: 'idle' | 'ok' | 'warn' | 'bad'
} {
  if (!connected) return { label: 'Not connected', glyph: '–', tone: 'idle' }
  if (status.state === 'syncing') return { label: 'Syncing', glyph: '↻', tone: 'ok' }
  if (status.state === 'error') return { label: 'Sync problem', glyph: '!', tone: 'bad' }
  if (status.pending) return { label: 'Changes waiting', glyph: '↑', tone: 'warn' }
  return { label: 'Synced', glyph: '✓', tone: 'ok' }
}
