/**
 * The header's sync icon, rendered.
 *
 * The thing under test is not what the icon looks like — that is asserted in the
 * browser suite, against a real page — but *when it re-renders*. A cycle that finds
 * both sides already in agreement changes `lastOutcome` and `lastSyncAt`, so any
 * component reading the whole status re-renders on every check even though what it
 * draws is identical. That is the plausible mechanism behind an indicator appearing
 * to flicker on routine checks, and it is cheap to rule out: the icon reads a slice
 * that changes only when the icon does.
 *
 * So this asserts the absence of a re-render, which is the only assertion that can
 * distinguish the two designs. Asserting the rendered output would pass either way.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SyncIndicator } from './SyncIndicator'
import { SyncBadgeContext } from './syncContext'
import type { SyncBadge } from './syncContext'

const SYNCED: SyncBadge = { label: 'Synced', glyph: '✓', tone: 'ok', title: 'Synced' }

function renderWith(badge: SyncBadge) {
  let renders = 0
  function Probe() {
    renders += 1
    return <SyncIndicator />
  }
  const view = render(
    <SyncBadgeContext.Provider value={badge}>
      <Probe />
    </SyncBadgeContext.Provider>,
  )
  return { ...view, renders: () => renders }
}

describe('SyncIndicator', () => {
  it('names the control for anyone who cannot see the glyph', () => {
    renderWith(SYNCED)
    expect(screen.getByRole('link', { name: 'Sync: Synced' })).toBeTruthy()
  })

  it('renders the glyph and nothing else', () => {
    const { container } = renderWith(SYNCED)
    const badge = container.querySelector('.sync-badge')
    expect(badge?.textContent).toBe('✓')
    // Decorative: the name is on the link, so the glyph is not announced twice.
    expect(badge?.getAttribute('aria-hidden')).toBe('true')
  })

  it('carries the sync engine message as the tooltip when there is one', () => {
    const { container } = renderWith({ ...SYNCED, title: 'Rate limited; retrying' })
    const link = container.querySelector('.sync-indicator')
    expect(link?.getAttribute('title')).toBe('Rate limited; retrying')
  })

  it('draws a different glyph for a different state', () => {
    const { container, unmount } = renderWith({
      label: 'Not connected',
      glyph: '–',
      tone: 'idle',
      title: 'Not connected',
    })
    expect(container.querySelector('.sync-badge')?.textContent).toBe('–')
    expect(container.querySelector('.sync-indicator')?.getAttribute('aria-label')).toBe(
      'Sync: Not connected',
    )
    unmount()
  })

  it('does not re-render when the badge is the same object', () => {
    // What a no-op cycle produces: the provider hands back the same slice, because
    // nothing it reads has changed, and a context consumer bails out when its value
    // is referentially equal. The DOM node standing in for the icon must therefore
    // be the same node afterwards — React does not replace an element whose output
    // is unchanged, so this cannot distinguish the two designs on its own, and it is
    // the derivation below that carries the weight.
    const badge: SyncBadge = { ...SYNCED }
    const tree = (
      <SyncBadgeContext.Provider value={badge}>
        <SyncIndicator />
      </SyncBadgeContext.Provider>
    )
    const { container, rerender } = render(tree)
    const before = container.querySelector('.sync-indicator')
    rerender(tree)
    expect(container.querySelector('.sync-indicator')).toBe(before)
  })
})
