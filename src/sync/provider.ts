/**
 * The sync provider contract.
 *
 * The engine depends only on this interface, never on a Dropbox client. A second
 * provider must be addable without touching the engine, so nothing above this
 * line may know what a rev is, what a scope is called, or what an app folder is.
 */

export type SyncErrorKind =
  | 'auth'
  /**
   * The token carries no file permissions.
   *
   * Split out from plain `auth` because the recovery is known rather than
   * guessed: the stored token is provably unusable, so discarding it is safe, and
   * it turns a dead end into a single reconnect instead of a message explaining
   * what to do.
   */
  | 'scope-missing'
  | 'rate-limited'
  | 'not-found'
  | 'conflict'
  | 'network'
  | 'unknown'

export class SyncError extends Error {
  readonly kind: SyncErrorKind
  readonly retryable: boolean

  constructor(kind: SyncErrorKind, message: string) {
    super(message)
    this.name = 'SyncError'
    this.kind = kind
    // Retryable: rate limits, transient network failures, and push conflicts — a
    // conflict means another device wrote first, so the answer is to re-read and
    // merge, which the engine does. Everything else is not: retrying a rejected
    // token or a refused permission just burns quota and returns the same answer.
    this.retryable = kind === 'rate-limited' || kind === 'network' || kind === 'conflict'
  }
}

export interface RemoteFile {
  body: string
  /**
   * Opaque provider revision.
   *
   * Used to detect that the remote changed since it was last read, so a
   * concurrent write is merged rather than clobbered. The engine never
   * interprets it.
   */
  rev: string
}

export interface ProviderStatus {
  authenticated: boolean
}

export interface SyncProvider {
  readonly id: string

  /**
   * Restore or acquire credentials.
   *
   * MUST be idempotent — it runs at the start of every cycle, and a provider
   * that prompts on the second call would break an unattended sync.
   */
  ensureAuth(): Promise<void>

  /**
   * Discard credentials.
   *
   * Local data MUST be untouched. Signing out of Dropbox is not a request to
   * delete anyone's CV.
   */
  signOut(): Promise<void>

  /** Current state, for the settings UI. */
  status(): Promise<ProviderStatus>

  /**
   * Read a file.
   *
   * MUST return `null` for "does not exist", which is distinct from an error:
   * a first run must not look like a failed fetch.
   */
  pull(path: string): Promise<RemoteFile | null>

  /**
   * Write a file.
   *
   * `expectedRev` MUST be enforced provider-side. This is the whole
   * conflict-detection mechanism — there is no client-side clock and no content
   * hashing involved in deciding whether a write is safe.
   */
  push(path: string, body: string, expectedRev: string | null): Promise<{ rev: string }>
}
