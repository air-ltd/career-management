/**
 * A hash router.
 *
 * Hash-based because GitHub Pages performs no request rewriting, so a deep link
 * to a path would be a real request for a file that does not exist (D3). The
 * `404.html` copy is a second line of defence, not the mechanism.
 *
 * Hand-rolled because the route table is five entries and a router would be the
 * largest dependency in the project for a list.
 */

import { useEffect, useState } from 'react'

export interface Route {
  /** A `/jobs/:id/edit` pattern. `:name` matches one path segment. */
  path: string
}

export type MatchResult = { route: Route; params: Record<string, string> } | null

function compile(pattern: string): { names: string[]; regex: RegExp } {
  const names: string[] = []
  const source = pattern
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      names.push(segment.slice(1))
      return '([^/]+)'
    })
    .join('/')
  return { names, regex: new RegExp(`^${source}/?$`) }
}

export function matchPath(path: string, routes: readonly Route[]): MatchResult {
  for (const route of routes) {
    const { names, regex } = compile(route.path)
    const found = regex.exec(path)
    if (!found) continue

    const params: Record<string, string> = {}
    names.forEach((name, index) => {
      // The capture group is guaranteed to exist when the regex matched, but
      // `noUncheckedIndexedAccess` cannot see that, and a `!` here would be a
      // crash on the one path where the router is least able to help.
      const value = found[index + 1]
      if (value !== undefined) params[name] = decodeURIComponent(value)
    })
    return { route, params }
  }
  return null
}

/**
 * The current hash path, without the leading `#`.
 *
 * An absent or empty hash normalises to `/`, because every route pattern starts
 * with a slash and `^/\/?$` does not match an empty string. Without this, a bare
 * URL renders "Nothing is routed at ." — which is exactly what an un-normalised
 * path produces on the app's very first load, and again after the OAuth redirect
 * clears the query string.
 *
 * The query string is cut off here rather than matched as part of the path: a
 * route pattern describes a path, and a query is a different thing that happens
 * to travel in the same fragment.
 */
export function currentPath(): string {
  const hash = window.location.hash
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  const query = path.indexOf('?')
  const withoutQuery = query === -1 ? path : path.slice(0, query)
  return withoutQuery === '' ? '/' : withoutQuery
}

/**
 * The current hash's query string, without the `?`.
 *
 * Empty when there is none.
 */
export function currentQuery(): string {
  const hash = window.location.hash
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  const query = path.indexOf('?')
  return query === -1 ? '' : path.slice(query + 1)
}

export interface Location {
  /** The path, without the query. */
  path: string
  /** The query, as a `URLSearchParams`. Empty for a URL with no query. */
  query: URLSearchParams
}

export function useLocation(): Location {
  const [location, setLocation] = useState(readLocation)

  useEffect(() => {
    const onChange = () => {
      setLocation(readLocation())
    }
    window.addEventListener('hashchange', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
    }
  }, [])

  return location
}

function readLocation(): Location {
  return { path: currentPath(), query: new URLSearchParams(currentQuery()) }
}

export function navigate(path: string): void {
  window.location.hash = path
}

/**
 * Put the focus back on the control that opened a form.
 *
 * The browser does not do this itself on a fragment navigation, and it should:
 * a user who opened a form with the keyboard and then closed it expects to be
 * back on the button they pressed, not at the top of the document with nothing
 * focused.
 *
 * The control is found by its href — the form's own route — rather than
 * remembered, so nothing has to be kept alive across the navigation, and a
 * control that is no longer on the page is simply not found. Where two controls
 * point at the same place — the row's title and its Edit button — the one in the
 * row's actions is preferred, because that is the one the user pressed.
 */
export function restoreFocusTo(route: string): void {
  let frames = 0
  const find = () => {
    const controls = [...document.querySelectorAll<HTMLElement>('a[href]')].filter(
      (control) => control.getAttribute('href') === route,
    )
    const target =
      controls.find((control) => control.closest('.inline-row-actions') !== null) ?? controls[0]
    if (target !== undefined) {
      target.focus()
      return
    }
    // The page has not rendered yet. A form is on a page of its own, so the
    // control is not in the document until the app has re-rendered — which is
    // a frame or two away, not now.
    frames += 1
    if (frames < 60) requestAnimationFrame(find)
  }
  requestAnimationFrame(find)
}
