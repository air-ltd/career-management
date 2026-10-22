/**
 * Whether a card in the rail is open.
 *
 * Remembered in this browser and nowhere else: it is a preference about this
 * screen, not about the document, so it is not written into the document and
 * does not sync to Dropbox. Two devices may disagree about it, which is right —
 * the person looking at one screen is not looking at the other.
 */

import { useCallback, useState } from 'react'

/** The storage key for a card. Namespaced, like the theme's. */
function key(name: string): string {
  return `cmd:disclosure:${name}`
}

export function useDisclosure(
  name: string,
  defaultOpen = true,
): {
  open: boolean
  setOpen: (next: boolean) => void
} {
  const [open, setOpen] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key(name))
      return stored === null ? defaultOpen : stored === 'true'
    } catch {
      // A browser with storage disabled, or a value that is not ours. Either way
      // the card still opens and closes; it just does not remember.
      return defaultOpen
    }
  })

  const update = useCallback(
    (next: boolean) => {
      setOpen(next)
      try {
        window.localStorage.setItem(key(name), String(next))
      } catch {
        // As above.
      }
    },
    [name],
  )

  return { open, setOpen: update }
}
