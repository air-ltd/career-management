import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { db } from '../storage/db'

/**
 * `matchMedia` is not implemented in jsdom, and the theme bootstrap reads it. A
 * stub that reports light is enough: tests that care about the dark theme set it
 * themselves through the preference rather than through the media query.
 */
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
})

/**
 * A fresh database per test.
 *
 * `fake-indexeddb/auto` gives the same in-memory backing store for the whole
 * file, so without this a record created in one test leaks into the next and the
 * failure reads as a merge bug rather than as test pollution.
 */
beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(() => {
  cleanup()
})
