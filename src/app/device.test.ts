/**
 * The device layer: what the interface asks the browser about itself.
 *
 * The point of these tests is not that `matchMedia` works — it is that the
 * answer is read *before* the first paint rather than in an effect, and that it
 * follows a change. An effect-based answer paints the desktop layout on a phone
 * first and changes it a frame later, which is a visible jump on every load.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PHONE_MEDIA, useMediaQuery, usePhoneLayout } from './device'

type Listener = (event: MediaQueryListEvent) => void

/**
 * A `matchMedia` that answers per query and can be told to change its mind.
 *
 * jsdom has no `matchMedia` of its own; the shared stub in `test/setup.ts`
 * reports "no" for everything, which is right for most tests and wrong here.
 */
function stubMatchMedia(answers: Record<string, boolean>): {
  set: (query: string, value: boolean) => void
} {
  const listeners = new Map<string, Set<Listener>>()
  const matches = new Map<string, boolean>(Object.entries(answers))

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      get matches() {
        return matches.get(query) ?? false
      },
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: Listener) => {
        const set = listeners.get(query) ?? new Set<Listener>()
        set.add(listener)
        listeners.set(query, set)
      },
      removeEventListener: (_type: string, listener: Listener) => {
        listeners.get(query)?.delete(listener)
      },
      dispatchEvent: () => false,
    }),
  })

  return {
    set: (query: string, value: boolean) => {
      matches.set(query, value)
      act(() => {
        for (const listener of listeners.get(query) ?? []) {
          listener({ matches: value } as MediaQueryListEvent)
        }
      })
    },
  }
}

describe('the device layer', () => {
  it('reads the answer before the first paint', () => {
    stubMatchMedia({ [PHONE_MEDIA]: true })
    const { result } = renderHook(() => usePhoneLayout())
    // No waiting, no act(): the first render already knows.
    expect(result.current).toBe(true)
  })

  it('follows the query changing under it', () => {
    const media = stubMatchMedia({ [PHONE_MEDIA]: false })
    const { result } = renderHook(() => usePhoneLayout())
    expect(result.current).toBe(false)
    media.set(PHONE_MEDIA, true)
    expect(result.current).toBe(true)
  })

  it('asks the same question the stylesheet asks', () => {
    stubMatchMedia({ [PHONE_MEDIA]: false })
    const { result } = renderHook(() => useMediaQuery(PHONE_MEDIA))
    expect(result.current).toBe(false)
    // The query is the stylesheet's, verbatim. If the two ever drift, this is
    // where it shows: the constant is what the mobile block is written against.
    expect(PHONE_MEDIA).toBe('(max-width: 40rem)')
  })

  it('re-reads when the query itself changes', () => {
    stubMatchMedia({ '(max-width: 40rem)': false, '(min-width: 40rem)': true })
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(max-width: 40rem)' },
    })
    expect(result.current).toBe(false)
    rerender({ query: '(min-width: 40rem)' })
    // The answer changes with the query, so the hook re-read rather than kept
    // the value it read for the old one.
    expect(result.current).toBe(true)
  })
})
