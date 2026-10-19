/**
 * The sync indicator in the header.
 *
 * An icon rather than a word. The words — "Not connected", "Syncing…", "Sync
 * problem", "Changes waiting", "Synced" — are all the same length of header holding
 * different lengths of text, and the reason they were in a fixed-width bubble is that
 * they reflowed the header every time the status changed. An icon has one shape for
 * every state, so that problem disappears and it takes a fraction of the room, which
 * matters now that the header also carries the questions page.
 *
 * The state is a small glyph in the cloud's corner rather than a colour, so the
 * difference survives someone who cannot tell amber from red. The words are not lost:
 * the link's accessible name carries them, and the tooltip carries the sync engine's
 * own message where it has one.
 *
 * It reads the badge context rather than the status, so a cycle that concludes there
 * is nothing to do — which still changes `lastOutcome` and `lastSyncAt` — leaves this
 * component alone. See `syncBadge.ts` for what each state looks like.
 */

import { CloudIcon } from '../../app/Icons'
import { useSyncBadge } from './syncContext'

export function SyncIndicator() {
  const { label, glyph, tone, title } = useSyncBadge()

  return (
    <a className="sync-indicator" href="#/sync" aria-label={`Sync: ${label}`} title={title}>
      <CloudIcon size={20} />
      <span className={`sync-badge sync-badge-${tone}`} aria-hidden="true">
        {glyph}
      </span>
    </a>
  )
}
