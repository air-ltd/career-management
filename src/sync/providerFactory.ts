/**
 * Builds the one Dropbox provider.
 *
 * A factory rather than a module-level singleton so tests can construct their
 * own, and so the provider's `refreshTokens` in-flight promise — which is how two
 * simultaneous failures are prevented from both minting a token and racing each
 * other's credential write — is shared by everything that uses it.
 */

import { DropboxProvider } from './dropbox/DropboxProvider'
import { readAppKey } from './appKey'
import { currentRedirectUri } from './redirect'
import { tokenStore } from '../storage/secretsRepo'
import { DROPBOX } from './dropbox/config'

let cached: DropboxProvider | null = null

export const REMOTE_PATH = DROPBOX.defaultRemotePath

export function indexedDbDropboxProvider(): DropboxProvider {
  cached ??= new DropboxProvider({
    clientId: readAppKey(),
    redirectUri: currentRedirectUri(),
    storage: tokenStore,
  })
  return cached
}

/** Drop the cached provider, after a sign-out or a client-id change. */
export function resetDropboxProvider(): void {
  cached = null
}
