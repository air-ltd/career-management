/**
 * The provider key, and where it is kept.
 *
 * Bring your own key. A static site with no server cannot hold a shared key:
 * anything compiled into the bundle is public the moment the site is deployed,
 * and a key compiled in is a key every visitor has (G1). So the key is the
 * user's own, and it is theirs alone.
 *
 * The secrets store, and not the document. The document syncs to Dropbox and is
 * exported; a key in it would travel to a third party and be written into files
 * the user sends to employers. The secrets store is a separate database that is
 * never synced, never exported and never backed up — the same store the Dropbox
 * OAuth token is kept in, and for the same reason (SEC4).
 *
 * The blast radius is worth stating plainly: a key sitting next to a CV means
 * that an XSS or a malicious dependency goes from "reads your CV" to "spends
 * your money". The key is read at the moment of a request and nowhere else, and
 * it is never written to a log.
 */

import { secrets } from '../storage/secretsRepo'

/** The name the key is stored under, per provider. */
function secretName(providerId: string): string {
  return `provider:${providerId}`
}

/** The key for a provider, if there is one. */
export async function readProviderKey(providerId: string): Promise<string> {
  try {
    const stored = await secrets.read(secretName(providerId))
    if (typeof stored !== 'object' || stored === null) return ''
    const key = (stored as { key?: unknown }).key
    return typeof key === 'string' ? key : ''
  } catch {
    // A browser with storage disabled, or a value that is not ours. Either way
    // there is no key, and the feature says so rather than failing.
    return ''
  }
}

/** Store the key for a provider. */
export async function writeProviderKey(providerId: string, key: string): Promise<void> {
  try {
    if (key === '') {
      await secrets.clear(secretName(providerId))
      return
    }
    await secrets.write(secretName(providerId), { key })
  } catch {
    // Nothing to do: the key is not stored, and the next read says so.
  }
}

/** Forget the key. */
export async function clearProviderKey(providerId: string): Promise<void> {
  try {
    await secrets.clear(secretName(providerId))
  } catch {
    // As above.
  }
}
