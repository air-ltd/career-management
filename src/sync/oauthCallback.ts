/**
 * Complete the OAuth redirect.
 *
 * Runs once at startup, before the app renders, and does nothing at all unless
 * the URL actually carries an authorisation response — which is every ordinary
 * visit.
 */

import { tokenStore } from '../storage/secretsRepo'
import { DropboxProvider } from './dropbox/DropboxProvider'
import { readAppKey } from './appKey'
import { currentRedirectUri } from './redirect'

const AUTH_ERROR_KEY = 'cmd:dropbox-auth-error'

/**
 * Memoised so the sync panel can await the outcome without starting a second
 * exchange, and without having to know whether one is already in flight.
 */
let inFlight: Promise<boolean> | null = null

export function beginAuthCallback(): Promise<boolean> {
  inFlight ??= completeAuthFromRedirect()
  return inFlight
}

/** The failure message from a redirect, read once and cleared. */
export function takeAuthError(): string | null {
  try {
    const message = window.sessionStorage.getItem(AUTH_ERROR_KEY)
    if (message === null) return null
    window.sessionStorage.removeItem(AUTH_ERROR_KEY)
    return message
  } catch {
    return null
  }
}

async function completeAuthFromRedirect(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const errorDescription = params.get('error_description') ?? params.get('error')

  if (code === null && errorDescription === null) return false

  /**
   * Clear the query string *before* exchanging.
   *
   * The code is single-use. Clearing afterwards would leave it in the URL for the
   * whole length of the network call, and a refresh during that window would try
   * to redeem it a second time and report a phantom authorisation failure.
   */
  const clean = `${window.location.pathname}${window.location.hash}`
  window.history.replaceState({}, '', clean)

  if (errorDescription !== null) {
    console.warn('[cmd] Dropbox authorisation did not complete:', errorDescription)
    return false
  }
  if (code === null || state === null) return false

  try {
    const provider = new DropboxProvider({
      clientId: readAppKey(),
      redirectUri: currentRedirectUri(),
      storage: tokenStore,
    })
    await provider.completeAuth(code, state)

    /**
     * Land on the sync page, which is where the result of this is visible.
     *
     * Safe to do unconditionally: the only path that reaches here is a fresh load
     * from Dropbox's redirect, so there is no navigation in progress to
     * interrupt and no prior hash to preserve.
     */
    window.location.hash = '/sync'
    return true
  } catch (error) {
    /**
     * Not rethrown. An authorisation failure must not stop the app starting — the
     * document is still fully usable, and the sync panel will show the reason.
     */
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.warn('[cmd] Dropbox authorisation failed:', message)
    try {
      window.sessionStorage.setItem(AUTH_ERROR_KEY, message)
    } catch {
      // Nothing to do; the console warning above is the remaining record.
    }
    return false
  }
}
