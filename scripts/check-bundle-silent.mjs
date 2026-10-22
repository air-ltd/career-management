/**
 * SEC1: the app MUST talk to exactly two third-party origins.
 *
 * The requirement is an exact count, so this checks an exact list. A check that
 * only confirmed the Dropbox hosts were *present* would pass against a bundle
 * also phoning an analytics endpoint, a font CDN or a telemetry beacon — which is
 * precisely the case the requirement exists to catch, and the reason "the allow-list
 * is present" is not the same claim as "the allow-list is the whole allow-list".
 *
 * The third was the assistant's provider. The assistant is not in this release
 * (see `src/ai/enabled.ts`), so the policy no longer permits it and the request
 * would be blocked — but the code is still in the bundle, so the host is still
 * named here. Keeping the name is the honest thing: this check is about what
 * the bundle *references*, and the gap between that and what the policy
 * *permits* is exactly the gap this check exists to make visible.
 *
 * Scans the built bundle rather than the source, because the property is about what
 * ships. A dependency added at build time, a stray URL in a comment that got
 * bundled, or a string introduced by a library all reach `dist` without appearing
 * anywhere the source-level review would look.
 *
 * The policy itself is asserted in `e2e/smoke.mjs` against the served page; this
 * is the other half — the policy says what is *permitted*, this says what is
 * actually *referenced*, and the interesting failures are the gap between them.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const DIST = resolve(import.meta.dirname, '..', 'dist')

/** SEC1, restated here so a change to it is a change to both. */
const ALLOWED_HOSTS = ['api.dropboxapi.com', 'content.dropboxapi.com', 'api.openai.com']

/**
 * Hosts the app legitimately names that are not network endpoints.
 *
 * Kept explicit rather than folded into the patterns below, so that a host added
 * here is a decision someone had to make.
 */
const ALLOWED_HOST_SUBSTRINGS = [
  // The Pages origin the production bundle is served from. It is where the app
  // itself comes from, not somewhere it sends data.
  'github.io',
  // Dropbox's OAuth host. The authorisation redirect is a top-level navigation
  // rather than a fetch, so it does not appear in `connect-src` — but it is
  // genuinely part of talking to Dropbox and must not read as a leak.
  'dropbox.com',
  // W3C namespaces, for the SVG and ARIA attributes every icon carries. They are
  // identifiers, not addresses, and matching them would be a false positive.
  'w3.org',
  'github.com',
  'schema.org',
]

/**
 * A URL or bare host in the bundle.
 *
 * Anchored on a *full* domain — at least two labels before a known TLD — because
 * the first version of this matched one label and reported `t.io`, seven times, out
 * of minified property accesses like `t.io==="input"`. A check that cries wolf on
 * its first run gets muted, and a muted SEC1 check is worse than none: it looks
 * like coverage.
 *
 * The wider the net the better, within that: the question is not whether a string
 * looks like a request, it is whether it names a host that is not on the list.
 */
const TLD = '(?:com|net|org|io|dev|app|co|uk|nz|au|gov|edu|me|info)'
const HOST = new RegExp(
  String.raw`(?:https?:\/\/)?` + // An explicit scheme makes it a request, whatever follows.
    String.raw`(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+` + // A label.
    String.raw`${TLD}` +
    // Not followed by a name character, so `react.devx` is not read as `react.dev`.
    // The preceding-label rule is handled below, where the match is inspected.
    String.raw`(?![a-z0-9-])`,
  'gi',
)

async function files(directory) {
  const out = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) out.push(...(await files(full)))
    else if (/\.(?:js|css|html)$/.test(entry.name)) out.push(full)
  }
  return out
}

function permitted(host) {
  const lowered = host.toLowerCase()
  if (ALLOWED_HOSTS.includes(lowered)) return true
  return ALLOWED_HOST_SUBSTRINGS.some((allowed) => lowered.includes(allowed))
}

async function main() {
  const targets = await files(DIST)
  if (targets.length === 0) {
    console.error('dist/ has no built files. Run `npm run build` first.')
    process.exit(1)
  }

  const found = new Map()

  for (const file of targets) {
    const body = await readFile(file, 'utf8')
    for (const match of body.matchAll(HOST)) {
      const host = match[0].toLowerCase().replace(/^https?:\/\//, '')
      // Two labels before the TLD, or a real domain's worth of name. A single
      // leading label is a file extension or a property access, not a host.
      if (host.replace(/\.[a-z0-9-]+$/, '').split('.').length < 2) continue
      if (permitted(host)) continue
      const seen = found.get(host) ?? { count: 0, files: new Set() }
      seen.count += 1
      seen.files.add(file.slice(DIST.length + 1))
      found.set(host, seen)
    }
  }

  if (found.size > 0) {
    console.error(
      `SEC1: the bundle names ${found.size} host(s) that are not on the allow-list.`,
    )
    for (const [host, seen] of [...found].sort()) {
      console.error(`  ${host}  (${seen.count}× in ${[...seen.files].join(', ')})`)
    }
    console.error(`\nPermitted: ${ALLOWED_HOSTS.join(', ')}`)
    console.error('If one of these is genuinely needed, add it to ALLOWED_HOSTS with a reason.')
    process.exit(1)
  }

  console.log(`SEC1: the bundle names no host beyond ${ALLOWED_HOSTS.join(' and ')}.`)
}

await main()
