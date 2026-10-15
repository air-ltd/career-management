/**
 * Which Dropbox app this origin talks to.
 *
 * Two apps exist — development and production (D25) — and which one is used is
 * decided by **where the app is running**, not by how it was built. A build made
 * on a laptop and served from `localhost` is a development build by virtue of the
 * address it is being served from, and a mis-built production bundle is still a
 * development app if someone hosts it anywhere else. The point is that a
 * development client can never reach the production document, whatever happened
 * upstream of it.
 *
 * Both keys are compiled in. This is deliberate: a Dropbox app key is an OAuth
 * *client id*, which is public by construction — it is embedded in the consent
 * screen URL that every user sees. It is not a credential, and treating it as one
 * buys nothing: the secret that would matter is the App secret, and this app
 * never has or uses one (PKCE means no client secret is required at all).
 *
 * An environment variable can still override a key for a specific build, which is
 * what `.env.example` is for. It cannot *add* a key, and it is consulted before
 * the built-ins rather than after.
 */

/**
 * The production host.
 *
 * Exact match only. Every other host — including `localhost` and `127.0.0.1` —
 * resolves to development, because a build served from an unexpected address
 * defaulting to production is the dangerous direction (SY32).
 */
export const PRODUCTION_HOSTS = ['air-ltd.github.io'] as const

export const BUILT_IN_KEYS = {
  production: 'j940zdg4vb622zt',
  development: 'pfmrgy11xyykfqa',
} as const

export type Environment = keyof typeof BUILT_IN_KEYS

/** `8`–`64` alphanumerics, which is what Dropbox issues. */
const APP_KEY_PATTERN = /^[a-z0-9]{8,64}$/i

/**
 * Shape check, used by tests and by the build-time check.
 *
 * Deliberately not enforced at runtime on a key that came from configuration: a
 * bad value there is a deliberate deploy-time decision, and silently discarding it
 * would send the app to production's key when someone meant development — the
 * opposite of what the override was for.
 */
export function isValidAppKey(value: string): boolean {
  return APP_KEY_PATTERN.test(value.trim())
}

/** The environment this origin is running in. Pure, so it is directly testable. */
export function environmentForHost(hostname: string): Environment {
  return (PRODUCTION_HOSTS as readonly string[]).includes(hostname)
    ? 'production'
    : 'development'
}

function envKey(variable: string): string {
  const env = import.meta.env as unknown as Record<string, string | undefined>
  return (env[variable] ?? '').trim()
}

/**
 * The client id to use.
 *
 * Precedence is environment variable, then built-in. A key saved in the browser
 * is *not* consulted: it silently overrode the host selection and then paired with
 * whichever redirect URI that other app had registered, so authorising locally
 * used one app's key against another app's redirect and Dropbox rejected it with
 * `invalid_redirect_uri`, naming nothing useful.
 */
export function readAppKey(): string {
  const environment = environmentForHost(window.location.hostname)
  const override = envKey(`VITE_DROPBOX_APP_KEY_${environment.toUpperCase()}`)
  if (override !== '') return override
  return BUILT_IN_KEYS[environment]
}

/** Which key is in play, and where it came from. Drives the badge in the header. */
export function describeKeySource(): {
  key: string
  environment: Environment
  source: 'environment' | 'builtin'
} {
  const environment = environmentForHost(window.location.hostname)
  const override = envKey(`VITE_DROPBOX_APP_KEY_${environment.toUpperCase()}`)
  return {
    key: override !== '' ? override : BUILT_IN_KEYS[environment],
    environment,
    source: override !== '' ? 'environment' : 'builtin',
  }
}
