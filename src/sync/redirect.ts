/**
 * The OAuth redirect URI, defined once.
 *
 * Three call sites use this — the provider, the redirect handler and the setup
 * panel — and they MUST agree. A mismatch is reported by Dropbox as
 * `invalid_redirect_uri` and nothing more useful than that, so the one
 * definition lives at the bottom of `sync/` with no imports, where everything
 * else can reach it.
 */

/** `import.meta.env.BASE_URL`, which always carries a trailing slash. */
function basePath(): string {
  const env = import.meta.env as unknown as Record<string, string | undefined>
  return env['BASE_URL'] ?? '/'
}

/** The redirect URI for wherever the app is actually being served. */
export function currentRedirectUri(): string {
  return `${window.location.origin}${basePath()}`
}

/** The deployed origin, host only, so a repository rename follows automatically. */
export const DEPLOYED_ORIGIN = 'https://air-ltd.github.io'

/** The redirect URI registered in the Dropbox App Console. */
export function deployedRedirectUri(): string {
  return `${DEPLOYED_ORIGIN}${basePath()}`
}

/** Where "home" is, resolved against the current origin rather than a hardcoded host. */
export function appHomeUrl(): string {
  return currentRedirectUri()
}
