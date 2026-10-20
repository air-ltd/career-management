/**
 * The sync contexts.
 *
 * The rule under test is the one that catches a mistake early: a hook used
 * outside its provider throws rather than handing back nothing, so the component
 * that forgot its provider fails at the point of the mistake rather than somewhere
 * further on.
 */

import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSync, useSyncBadge } from './syncContext'

describe('the sync hooks', () => {
  it('throw outside a provider, rather than handing back nothing', () => {
    // A component that forgot its provider would otherwise get undefined and
    // fail somewhere further on, with a message about the wrong thing.
    expect(() => renderHook(() => useSync())).toThrow(
      /useSync must be used inside a SyncProvider/,
    )
    expect(() => renderHook(() => useSyncBadge())).toThrow(
      /useSyncBadge must be used inside a SyncProvider/,
    )
  })
})
