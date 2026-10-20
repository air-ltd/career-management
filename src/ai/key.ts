/**
 * The provider key, and where it is kept.
 *
 * Bring your own key. A static site with no server cannot hold a shared key:
 * anything compiled into the bundle is public the moment the site is deployed,
 * and a key compiled in is a key every visitor has (G1). So the key is the
 * user's own, and it is theirs alone.
 *
 * `localStorage`, and not the document. The document syncs to Dropbox and is
 * exported; a key in it would travel to a third party and be written into files
 * the user sends to employers. The key is in this browser, on this device, and
 * nowhere else. That is also why it is not covered by the backup: restoring a
 * document onto another machine restores the document, and the user sets the key
 * again there.
 *
 * The blast radius is worth stating plainly: a key sitting next to a CV means
 * that an XSS or a malicious dependency goes from "reads your CV" to "spends
 * your money". The key is read at the moment of a request and nowhere else, and
 * it is never written to a log.
 */

/** The storage key. Namespaced, like the theme's. */
const STORAGE_KEY = 'cmd:provider-key'

/** The provider the key is for, so a second provider gets its own. */
export interface StoredKey {
  providerId: string
  key: string
}

/** The key for a provider, if there is one. */
export function readProviderKey(providerId: string): string {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return ''
    const parsed = JSON.parse(raw) as Partial<StoredKey>
    if (parsed.providerId !== providerId) return ''
    return typeof parsed.key === 'string' ? parsed.key : ''
  } catch {
    // A browser with storage disabled, or a value that is not ours. Either way
    // there is no key, and the feature says so rather than failing.
    return ''
  }
}

/** Store the key for a provider, replacing any other provider's. */
export function writeProviderKey(providerId: string, key: string): void {
  try {
    if (key === '') {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ providerId, key }))
  } catch {
    // Nothing to do: the key is not stored, and the next read says so.
  }
}

/** Forget the key. */
export function clearProviderKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // As above.
  }
}
