/**
 * Fail the build if a credential-shaped string reaches the bundle.
 *
 * The Dropbox keys in `src/sync/appKey.ts` are OAuth client ids, which are
 * public by construction. What must never be here is an App secret, an access
 * token, or an API key for anything else — all of which would be readable by
 * anyone who loads the site, and two of which would also grant access to data.
 *
 * Pattern-based rather than a denylist, because the interesting property is the
 * *shape* of a thing, not its name: a token an AI integration adds in Phase 10
 * will not match a list written now.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const DIST = resolve(import.meta.dirname, '..', 'dist', 'assets')

/** Long base64-ish or hex runs, and the words that make them credentials. */
const SUSPECT =
  /(?:sk-[A-Za-z0-9_-]{20,}|(?:secret|password|passwd|api[_-]?key|token|bearer)['"']?\s*[:=]['"']?\s*['"]?[A-Za-z0-9_\-./+]{16,})/gi

async function files(directory) {
  const out = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) out.push(...(await files(full)))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

const found = []
for (const file of await files(DIST)) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(SUSPECT)) {
    found.push(`${file.replace(DIST, '')}: ${match[0].slice(0, 60)}…`)
  }
}

if (found.length > 0) {
  console.error('Possible credentials in the bundle:')
  for (const item of found) console.error(`  ${item}`)
  process.exit(1)
}

console.log('No credentials found in the bundle.')
