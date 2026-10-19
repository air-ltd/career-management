/**
 * The Dropbox sync provider.
 *
 * The only file in the project that knows Dropbox exists. Everything above it
 * speaks `SyncProvider` (SY-file boundaries in the spec, section 6.1).
 *
 * Every external dependency is injected — `fetch`, the random source, the clock,
 * the token store — which is what makes a 900-line file like this testable at
 * all. There is no code path in here that cannot be driven from a test with no
 * network and no real Dropbox.
 */

import { SyncError, type RemoteFile, type SyncProvider } from '../provider'
import { DROPBOX, STRICT_CONFLICT, normalizePath } from './config'

export interface DropboxTokens {
  accessToken: string
  /** Absent when Dropbox returned no expiry. */
  expiresAt?: number
  accountId?: string
  /**
   * Only present because the authorize request sets `token_access_type=offline`
   * (SY5). Without that parameter Dropbox returns no refresh token at all, and
   * the connection dies four hours later with no way back.
   */
  refreshToken?: string
}

/**
 * The token store, as far as this file is concerned.
 *
 * Declared here rather than imported so the provider does not depend on the
 * storage layer's shape — only on "somewhere safe".
 */
export interface TokenStore {
  read(): Promise<unknown>
  write(value: DropboxTokens): Promise<void>
  clear(): Promise<void>
}

export interface DropboxProviderOptions {
  clientId: string
  /** Must exactly match a redirect URI registered in the App Console. */
  redirectUri: string
  storage: TokenStore
  fetchImpl?: typeof fetch
  randomBytes?: (length: number) => Uint8Array
  now?: () => number
}

type RefreshResult =
  { ok: true; accessToken: string } | { ok: false; reason: 'rejected' | 'unreachable' }

/**
 * Used when Dropbox returns no `expires_in`.
 *
 * Dropbox documents access tokens as lasting four hours, so assuming that is
 * better than assuming they never expire and failing at the worst moment.
 */
const TOKEN_TTL_FALLBACK_MS = 4 * 60 * 60 * 1000

/**
 * Where the pending PKCE record lives between the redirect away and the redirect
 * back.
 *
 * `sessionStorage`, not `localStorage`: it survives the same-tab navigation that
 * the OAuth flow requires and is discarded when the tab closes. `localStorage`
 * would leave a code verifier lying around indefinitely.
 */
const PENDING_KEY = 'cmd:dropbox-pending'
const PENDING_TTL_MS = 10 * 60 * 1000

interface PendingAuth {
  verifier: string
  state: string
  createdAt: number
}

export class DropboxProvider implements SyncProvider {
  readonly id = 'dropbox'

  private readonly clientId: string
  private readonly redirectUri: string
  private readonly storage: TokenStore
  private readonly fetchImpl: typeof fetch
  private readonly random: (length: number) => Uint8Array
  private readonly now: () => number

  /**
   * Three states, not a boolean, and the distinction is the whole point:
   *
   * - `undefined` — not attempted yet, so it is worth attempting.
   * - a promise  — in flight and shared, so two requests failing together make
   *   one token exchange rather than two racing credential writes.
   * - `null`     — attempted and failed; the refresh token is dead and trying
   *   again this session is pointless.
   */
  private refreshTokens: Promise<RefreshResult> | null | undefined = undefined

  private verifier: string | null = null
  private inMemoryState: string | null = null

  constructor(options: DropboxProviderOptions) {
    this.clientId = options.clientId
    this.redirectUri = options.redirectUri
    this.storage = options.storage
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.random = options.randomBytes ?? defaultRandomBytes
    this.now = options.now ?? (() => Date.now())
  }

  // ---------------------------------------------------------------- auth

  /**
   * Begin the PKCE flow and return the URL to send the user to.
   *
   * Async only because `crypto.subtle` has no synchronous digest.
   */
  async beginAuth(state: string): Promise<{ url: string }> {
    const verifier = base64Url(this.random(64))
    this.verifier = verifier
    this.inMemoryState = state
    this.writePending({ verifier, state, createdAt: this.now() })

    const url = new URL(DROPBOX.authorizeUrl)
    url.searchParams.set('client_id', this.clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('redirect_uri', this.redirectUri)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('code_challenge', base64Url(await sha256(verifier)))
    url.searchParams.set('state', state)
    /**
     * Dropbox documents this as a requirement, not a default. Without it, no
     * refresh token is returned and the connection is dead in four hours with no
     * way back. A test asserting this parameter is on the URL is what keeps it
     * there.
     */
    url.searchParams.set('token_access_type', 'offline')
    /**
     * No `scope` parameter, deliberately.
     *
     * Leaving it off makes the App Console the single source of truth.
     * Requesting an explicit subset is fragile in a specific way: if the console
     * and this line disagree by even one scope, Dropbox rejects the whole
     * authorisation with `scope_not_granted` and the app cannot start at all.
     * Least privilege comes from ticking only the two scopes in the console.
     */
    return { url: url.toString() }
  }

  /** Exchange the authorisation code from the redirect for tokens. */
  async completeAuth(code: string, state: string): Promise<void> {
    const pending = this.readPending()
    if (!pending) {
      throw new SyncError(
        'auth',
        'This authorisation link has expired or was started in a different browser tab. Start again from the Sync panel.',
      )
    }
    if (pending.state !== state) {
      this.clearPending()
      throw new SyncError('auth', 'Authorisation state did not match. Start again.')
    }

    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code_verifier: pending.verifier,
    })

    // No client secret anywhere: this is a public PKCE client (SY11).
    const response = await this.fetchImpl(DROPBOX.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      const detail = await describeFailure(response, { op: 'token exchange' })
      throw detail.error
    }

    const json = (await response.json()) as {
      access_token?: string
      expires_in?: number
      account_id?: string
      refresh_token?: string
    }
    if (typeof json.access_token !== 'string') {
      throw new SyncError('auth', 'Dropbox returned an unexpected response to the sign-in.')
    }

    await this.storage.write({
      accessToken: json.access_token,
      expiresAt: this.now() + (json.expires_in ?? TOKEN_TTL_FALLBACK_MS / 1000) * 1000,
      ...(json.account_id ? { accountId: json.account_id } : {}),
      ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}),
    })

    this.verifier = null
    this.inMemoryState = null
    this.clearPending()
  }

  /**
   * Make sure there is a usable access token, refreshing if the stored one has
   * expired. Throws `auth` if there is nothing to work with.
   */
  async ensureAuth(): Promise<void> {
    const tokens = toTokens(await this.storage.read())
    if (!tokens?.accessToken) {
      throw new SyncError('auth', 'Not connected to Dropbox.')
    }

    if (tokens.expiresAt !== undefined && tokens.expiresAt <= this.now()) {
      if (tokens.refreshToken === undefined) {
        throw new SyncError('auth', 'Not connected to Dropbox.')
      }
      const outcome = await this.runRefresh()
      if (outcome.ok) return
      throw this.refreshFailure(outcome.reason)
    }
  }

  /**
   * `rejected` is `auth`, which the scheduler recovers from by discarding the
   * credential and offering Connect. `unreachable` is `network`, which it does
   * not — it backs off and tries again. That single distinction is what keeps a
   * dropped connection from signing someone out.
   */
  private refreshFailure(reason: 'rejected' | 'unreachable'): SyncError {
    return reason === 'rejected'
      ? new SyncError('auth', 'Not connected to Dropbox.')
      : new SyncError('network', 'Could not reach Dropbox to renew the connection.')
  }

  /** Shared so concurrent callers make one exchange, not several. */
  private runRefresh(): Promise<RefreshResult> {
    this.refreshTokens ??= this.refreshAccessToken().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'unknown'
      return message.includes('unreachable')
        ? ({ ok: false, reason: 'unreachable' } as const)
        : ({ ok: false, reason: 'rejected' } as const)
    })
    return this.refreshTokens
  }

  private async refreshAccessToken(): Promise<RefreshResult> {
    const stored = toTokens(await this.storage.read())
    if (!stored?.refreshToken) {
      this.refreshTokens = null
      return { ok: false, reason: 'rejected' }
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refreshToken,
      client_id: this.clientId,
    })

    let response: Response
    try {
      response = await this.fetchImpl(DROPBOX.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch {
      // Offline, DNS failure, blocked request. The credential is still good.
      return { ok: false, reason: 'unreachable' }
    }

    if (!response.ok) {
      // 4xx other than 429 means Dropbox refused this token, so it is dead. 5xx
      // and 429 mean Dropbox is unavailable or throttling, so it is not — and
      // retrying is the whole point.
      const refused = response.status >= 400 && response.status < 500 && response.status !== 429
      if (refused) this.refreshTokens = null
      return { ok: false, reason: refused ? 'rejected' : 'unreachable' }
    }

    const json = (await response.json()) as { access_token?: string; expires_in?: number }
    if (typeof json.access_token !== 'string') {
      // A 200 with no token is malformed, not a refusal. Leave the credential
      // alone and try again later.
      return { ok: false, reason: 'unreachable' }
    }

    /**
     * Spread the stored credential rather than rebuilding it, so a field added
     * to `DropboxTokens` later is not silently dropped on the first refresh —
     * which is how the refresh token itself was nearly lost.
     */
    await this.storage.write({
      ...stored,
      accessToken: json.access_token,
      expiresAt: this.now() + (json.expires_in ?? TOKEN_TTL_FALLBACK_MS / 1000) * 1000,
    })

    return { ok: true, accessToken: json.access_token }
  }

  async signOut(): Promise<void> {
    this.verifier = null
    this.inMemoryState = null
    this.refreshTokens = undefined
    this.clearPending()
    // Local data is untouched: signing out of Dropbox is not a request to delete
    // anyone's document.
    await this.storage.clear()
  }

  async status() {
    return { authenticated: await this.hasUsableToken() }
  }

  /** Local state only, no network. Drives whether to offer "Connect". */
  async hasUsableToken(): Promise<boolean> {
    const tokens = toTokens(await this.storage.read())
    if (!tokens?.accessToken) return false
    if (tokens.expiresAt !== undefined && tokens.expiresAt <= this.now()) {
      return tokens.refreshToken !== undefined
    }
    return true
  }

  // ---------------------------------------------------------------- files

  async pull(path: string): Promise<RemoteFile | null> {
    const arg = { path: normalizePath(path) }

    const response = await this.authenticated((accessToken) =>
      this.fetchImpl(DROPBOX.downloadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Dropbox-API-Arg': JSON.stringify(arg),
        },
      }),
    )

    if (response.ok) {
      // The rev on download comes from the response *header*, not the body.
      const rev = response.headers.get('dropbox-api-result')
      const body = await response.text()
      return { body, rev: rev ? parseRev(rev) : 'unknown' }
    }

    const detail = await describeFailure(response, { op: `download ${arg.path}`, args: arg })
    // "Not there" and "could not read it" are different answers, and a first run
    // must not look like a failure.
    if (detail.kind === 'not-found') return null
    throw detail.error
  }

  async push(path: string, body: string, expectedRev: string | null): Promise<{ rev: string }> {
    const args = {
      path: normalizePath(path),
      // A known rev means "only if unchanged"; no rev means first run.
      mode: expectedRev ? DROPBOX.updateMode(expectedRev) : DROPBOX.overwriteMode,
      // Never create a duplicate file on a conflict.
      autorename: false,
      // No "X edited a file" notifications for every sync.
      mute: true,
      strict_conflict: STRICT_CONFLICT,
    }

    const response = await this.authenticated((accessToken) =>
      this.fetchImpl(DROPBOX.uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify(args),
        },
        body,
      }),
    )

    if (response.ok) {
      const json = (await response.json()) as { rev?: string }
      return { rev: json.rev ?? 'unknown' }
    }

    const detail = await describeFailure(response, { op: `upload ${args.path}`, args })
    if (detail.kind === 'conflict') {
      throw new SyncError('conflict', 'The remote file changed before this write landed.')
    }
    throw detail.error
  }

  // ---------------------------------------------------------------- internals

  /**
   * Send a request, refreshing once if the token turns out to be rejected.
   *
   * Two bounds, both load-bearing. Only 401 and 403 trigger a refresh —
   * refreshing on any failure would spend a round trip per rate limit and make
   * network trouble look like credential trouble. And only *one* retry: a dead
   * refresh token returns `invalid_grant`, and an unbounded retry is a loop that
   * looks like syncing.
   *
   * Throwing rather than returning the original 401 is deliberate: returning it
   * surfaced a 502 from the token endpoint to the user as an authentication
   * failure, which cost someone their connection.
   */
  private async authenticated(
    send: (accessToken: string) => Promise<Response>,
  ): Promise<Response> {
    const tokens = await this.requireToken()
    const response = await send(tokens.accessToken)
    if (!isAuthFailure(response.status)) return response
    if (tokens.refreshToken === undefined) return response

    const outcome = await this.runRefresh()
    if (!outcome.ok) throw this.refreshFailure(outcome.reason)
    return await send(outcome.accessToken)
  }

  private async requireToken(): Promise<DropboxTokens> {
    const tokens = toTokens(await this.storage.read())
    if (!tokens?.accessToken) {
      throw new SyncError('auth', 'Not connected to Dropbox.')
    }
    return tokens
  }

  private writePending(pending: PendingAuth): void {
    try {
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    } catch {
      /**
       * Failing here, at the point of starting, rather than later on the way back
       * with an unexplained authorisation error.
       */
      throw new SyncError(
        'auth',
        'This browser is blocking session storage, so the Dropbox authorisation cannot be completed.',
      )
    }
  }

  /**
   * Three tiers, because the durable one can be unavailable.
   *
   * `sessionStorage` is the one that survives the navigation. The in-memory
   * fields are a fallback for when storage is blocked entirely, and they only
   * work if no navigation happened — which is better than failing, but it is not
   * sufficient on its own, since the OAuth redirect is a full page load and
   * anything held only in memory is gone by the time the code comes back.
   */
  private readPending(): PendingAuth | null {
    let parsed: unknown
    try {
      const raw = window.sessionStorage.getItem(PENDING_KEY)
      if (raw !== null) parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }

    if (isPendingAuth(parsed)) {
      if (this.now() - parsed.createdAt > PENDING_TTL_MS) {
        this.clearPending()
        return null
      }
      return parsed
    }

    if (this.verifier !== null && this.inMemoryState !== null) {
      return { verifier: this.verifier, state: this.inMemoryState, createdAt: this.now() }
    }
    return null
  }

  private clearPending(): void {
    try {
      window.sessionStorage.removeItem(PENDING_KEY)
    } catch {
      // Nothing to clear if storage is unavailable in the first place.
    }
  }
}

// ------------------------------------------------------------------ helpers

function isPendingAuth(value: unknown): value is PendingAuth {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate['verifier'] === 'string' &&
    candidate['verifier'] !== '' &&
    typeof candidate['state'] === 'string' &&
    typeof candidate['createdAt'] === 'number'
  )
}

/**
 * Defensive parse of the stored credential.
 *
 * A malformed record yields `null` so the user is prompted to reconnect, rather
 * than the app failing on a shape mismatch — or worse, using a field that
 * happens to be a string where a token was expected.
 */
function toTokens(value: unknown): DropboxTokens | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate['accessToken'] !== 'string' || candidate['accessToken'] === '')
    return null

  return {
    accessToken: candidate['accessToken'],
    ...(typeof candidate['expiresAt'] === 'number'
      ? { expiresAt: candidate['expiresAt'] }
      : {}),
    ...(typeof candidate['accountId'] === 'string'
      ? { accountId: candidate['accountId'] }
      : {}),
    ...(typeof candidate['refreshToken'] === 'string'
      ? { refreshToken: candidate['refreshToken'] }
      : {}),
  }
}

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403
}

function parseRev(header: string): string {
  try {
    const parsed: unknown = JSON.parse(header)
    if (typeof parsed === 'object' && parsed !== null) {
      const rev = (parsed as Record<string, unknown>)['rev']
      if (typeof rev === 'string') return rev
    }
  } catch {
    // Fall through to the sentinel below.
  }
  return 'unknown'
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(value: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(value)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new SyncError('auth', 'No subtle crypto available for the PKCE challenge.')
  }
  return new Uint8Array(await subtle.digest('SHA-256', encoded))
}

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const webCrypto = globalThis.crypto
  if (!webCrypto?.getRandomValues) {
    throw new SyncError('auth', 'No secure random source available for PKCE.')
  }
  webCrypto.getRandomValues(bytes)
  return bytes
}

type FailureKind = SyncError['kind'] | 'not-found' | 'conflict'

interface CallContext {
  op: string
  args?: unknown
}

/**
 * Turn a failed Dropbox response into one classified error.
 *
 * The body is read exactly once, as text. Calling `response.json()` and then
 * trying to read it again for a message is how an error ends up with no detail
 * at all, which is how a previous version ended up asserting a cause — "no
 * permissions were ticked" — that turned out to be wrong, hiding the status and
 * body that would have shown it.
 */
async function describeFailure(
  response: Response,
  call: CallContext,
): Promise<{ kind: FailureKind; error: SyncError }> {
  let raw = ''
  try {
    raw = await response.text()
  } catch {
    // A body that cannot be read is not itself informative; the status still is.
  }

  let summary = ''
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      const value = (parsed as Record<string, unknown>)['error_summary']
      if (typeof value === 'string') summary = value
    }
  } catch {
    // Not JSON. The truncated body below is the best available detail.
  }

  const detail =
    `\nHTTP ${String(response.status)} on ${call.op}` +
    (call.args ? `\nargs: ${JSON.stringify(call.args)}` : '') +
    (summary ? `\nDropbox said: ${summary}` : '') +
    (raw && !summary ? `\nbody: ${raw.slice(0, 300)}` : '')

  const status = response.status

  if (status === 401) {
    return {
      kind: 'auth',
      error: new SyncError('auth', `Dropbox rejected the token.${detail}`),
    }
  }
  if (status === 429) {
    return {
      kind: 'rate-limited',
      error: new SyncError('rate-limited', `Dropbox rate limit reached.${detail}`),
    }
  }
  if (status === 409 && summary.includes('not_found')) {
    return { kind: 'not-found', error: new SyncError('not-found', `File not found.${detail}`) }
  }
  if (status === 409) {
    return {
      kind: 'conflict',
      error: new SyncError('conflict', `The remote file changed.${detail}`),
    }
  }
  if (summary.startsWith('missing_scope')) {
    return {
      kind: 'scope-missing',
      error: new SyncError(
        'scope-missing',
        `The Dropbox connection has no file permissions.${detail}`,
      ),
    }
  }

  // Report what came back rather than guessing a cause.
  return {
    kind: 'unknown',
    error: new SyncError(
      'unknown',
      `Dropbox rejected the request without saying why.${detail}`,
    ),
  }
}
