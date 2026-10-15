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

/** The current hash path, without the leading `#`. */
export function currentPath(): string {
  const hash = window.location.hash
  return hash.startsWith('#') ? hash.slice(1) : hash
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const onChange = () => {
      setPath(currentPath())
    }
    window.addEventListener('hashchange', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
    }
  }, [])

  return path
}

export function navigate(path: string): void {
  window.location.hash = path
}
