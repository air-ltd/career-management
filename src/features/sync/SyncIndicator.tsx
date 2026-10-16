/**
 * The sync indicator in the header.
 *
 * States only, no detail and no actions: the header says whether this device is
 * connected and whether anything is outstanding, and links to the page where the
 * detail and the "Sync now" button live. A control per feature would make the
 * header the place everything goes to hide.
 */

import { useSync } from './syncContext'

export function SyncIndicator() {
  const { status, connected } = useSync()

  const { label, tone } = describe(connected, status.state, status.pending)

  return (
    <a className="sync-indicator" href="#/sync" title={status.message ?? label}>
      <span className={tone}>{label}</span>
    </a>
  )
}

function describe(
  connected: boolean,
  state: 'idle' | 'syncing' | 'error',
  pending: boolean,
): { label: string; tone: string } {
  if (!connected) return { label: 'Not connected', tone: 'badge' }
  if (state === 'syncing') return { label: 'Syncing…', tone: 'badge badge-ok' }
  if (state === 'error') return { label: 'Sync problem', tone: 'badge badge-warn' }
  if (pending) return { label: 'Changes waiting', tone: 'badge badge-warn' }
  return { label: 'Synced', tone: 'badge badge-ok' }
}
