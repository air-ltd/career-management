/**
 * Fail the build if a requirement id cited in source does not exist.
 *
 * D1-D53 and SY1-SY34 are the design record. A citation to a number that does
 * not exist is worse than no citation: it reads as if the requirement is
 * written down somewhere when it has actually been lost or renumbered.
 *
 * This compares source text against the spec text, so renumbering a requirement
 * breaks the build rather than silently orphaning the references.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..')
const SPEC = join(REPO, 'specs', '0001-plan.md')

async function sourceFiles(directory) {
  const out = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      out.push(...(await sourceFiles(full)))
      continue
    }
    if (/\.(ts|tsx|js|mjs|json|html)$/.test(entry.name)) out.push(full)
  }
  return out
}

const spec = await readFile(SPEC, 'utf8')

/** The ids the spec actually defines, as **D12** / **SY5** headings. */
const defined = new Set(
  [...spec.matchAll(/\*\*(D|SY)(\d+)\*\*/g)].map((match) => `${match[1]}${match[2]}`),
)

const broken = []
for (const file of await sourceFiles(join(REPO, 'src'))) {
  const text = await readFile(file, 'utf8')
  // Only code is checked. Comments are where a citation goes stale — a
  // requirement renumbered in the spec but not in a comment above a function is
  // exactly the failure this is for.
  for (const match of text.matchAll(/\b(D|SY)(\d{1,2})\b/g)) {
    const id = `${match[1]}${match[2]}`
    if (!defined.has(id)) {
      broken.push(`${file.replace(REPO, '')}: ${id} (referenced as "${match[0]}")`)
    }
  }
}

if (broken.length > 0) {
  console.error('Requirement citations that do not resolve:')
  for (const item of broken) console.error(`  ${item}`)
  console.error(
    `\nDefined ids: D1-D${Math.max(...[...defined].filter((i) => i.startsWith('D')).map((i) => Number(i.slice(1))))}, SY1-SY${Math.max(...[...defined].filter((i) => i.startsWith('SY')).map((i) => Number(i.slice(2))))}.`,
  )
  process.exit(1)
}

console.log(`All citations resolve (D and SY ids, ${defined.size} defined).`)
