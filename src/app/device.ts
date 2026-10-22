/**
 * What the device is, asked of the browser rather than guessed at.
 *
 * The app is one bundle that runs in a browser on a laptop and in a browser on a
 * phone. There is no build-time split and no second codebase: the same routes,
 * the same records and the same document, arranged differently.
 *
 * So "is this a phone" is a question the interface asks at run time. What it
 * changes is arrangement — where the section links sit, how big the tap targets
 * are, whether the document's controls are open or folded away — and never what
 * the app does. A record is added on a phone by exactly the code that adds one on
 * a laptop, and the document is the same document.
 *
 * The width here is the same 40rem the stylesheet uses, so the JavaScript and the
 * CSS agree about where the boundary is. If one of them moves, the other has to
 * move with it, and the test in `device.test.ts` is what says they have.
 */
import { useCallback, useSyncExternalStore } from 'react'

/**
 * The phone layout: below this width the app is a phone-sized interface.
 *
 * The same query as the stylesheet's mobile block. Kept as a constant so the two
 * are changed together rather than one being changed alone.
 */
export const PHONE_MEDIA = '(max-width: 40rem)'

/**
 * Whether a media query currently matches.
 *
 * `useSyncExternalStore` rather than state and an effect, for two reasons. The
 * value is read while rendering, so the first paint is already the right
 * layout: an effect would paint the desktop layout on a phone and change it a
 * frame later, which is a visible jump on every load. And the store subscribes
 * to the browser's own change event, so a phone rotated into a wider layout, or
 * a window resized on a tablet, changes the answer without a reload.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => {
        list.removeEventListener('change', onChange)
      }
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/**
 * Whether the app is being used at phone width.
 *
 * The seam a mobile-specific arrangement hangs off. A component asks this rather
 * than measuring the window itself: measuring in each component is how two
 * components end up disagreeing about the width.
 */
export function usePhoneLayout(): boolean {
  return useMediaQuery(PHONE_MEDIA)
}
