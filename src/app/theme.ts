/**
 * Theme preference.
 *
 * The value lives in two places on purpose, and the duplication is a real
 * constraint rather than an oversight:
 *
 * - IndexedDB holds the durable copy, with the rest of the document, so it syncs
 *   between devices like everything else.
 * - `localStorage` holds a narrow mirror, because IndexedDB cannot be read
 *   synchronously and the theme has to be applied before first paint or the page
 *   flashes the wrong one (D14).
 *
 * The mirror is only ever written from here, and the inline bootstrap in
 * `index.html` is only ever read by the browser. If the key or the logic changes
 * in one it must change in the other.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'cmd:theme'

export function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  } catch {
    // Private browsing can throw on access. A wrong theme is cosmetic.
    return 'system'
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Deliberately ignored: the theme still applies for this session via the
    // attribute set below, and failing the write is not worth interrupting the user.
  }
}

export function resolveTheme(
  preference: ThemePreference,
  darkBySystem: boolean,
): 'light' | 'dark' {
  if (preference === 'dark') return 'dark'
  if (preference === 'light') return 'light'
  return darkBySystem ? 'dark' : 'light'
}

export function applyTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.dataset['theme'] = resolved
}

/** Whether the system currently prefers a dark scheme. */
export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
