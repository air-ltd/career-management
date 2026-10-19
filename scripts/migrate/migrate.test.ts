/**
 * Run the migration CLI over the committed fixture database.
 *
 * This is the spec's verification gate for the migration (MIG9), and it needs no
 * browser and no network: it runs the real CLI over the real fixture and checks
 * what the app would then show.
 *
 * It also covers the byte-identical gate, which is the one that catches a clock
 * read from somewhere it should not have been.
 *
 * Run: `npm run migrate:fixture`
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseEnvelope, narrowTables } from '../../src/export/envelope'
import { resolve } from 'node:path'

// The directory this script lives in, so the fixture and the runner resolve
// without depending on the current working directory.
const root = resolve(import.meta.dirname)
const fixture = resolve(root, 'fixtures', 'legacy.sqlite3')
const runner = resolve(root, '..', 'run-migration.mjs')

function run(
  out: string,
  extra: readonly string[] = [],
): { status: number | null; stdout: string } {
  const result = spawnSync('node', [runner, fixture, '--out', out, ...extra], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, TZ: 'Pacific/Auckland' },
  })
  return { status: result.status, stdout: `${result.stdout}${result.stderr}` }
}

describe('the migration over the committed fixture', () => {
  const out = resolve(root, 'out.json')
  const outAgain = resolve(root, 'out-again.json')

  it('produces an envelope the app accepts, with the counts the fixture implies', () => {
    expect(existsSync(fixture)).toBe(true)
    const { status, stdout } = run(out)
    expect(status).not.toBe(0) // the fixture deliberately contains losses
    expect(stdout).toContain('Wrote')

    const envelope = JSON.parse(readFileSync(out, 'utf8'))
    const parsed = parseEnvelope(envelope, 1)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    // Every record passes its own table's schema — no silent drops.
    const narrowed = narrowTables(parsed.snapshot)
    expect(narrowed.rejected).toEqual([])

    // What the fixture holds, after the rows that cannot be migrated are dropped:
    // 1 normal job, 1 current role, 1 question category, 1 unreadable job.
    expect(envelope.counts['jobs']).toBe(2)
    // 1 under the normal job, 1 question under the category, 1 orphan attached to
    // the highest job, 1 double-escaped, and 1 blank achievement that is dropped.
    expect(envelope.counts['achievements']).toBe(3)
    expect(envelope.counts['questions']).toBe(1)
    // 1 award, 2 education (one explicit, one guessed), 1 guessed-to-award, and 1
    // with a year of "None" that is skipped.
    expect(envelope.counts['awards']).toBe(2)
    expect(envelope.counts['education']).toBe(2)
    // Both header rows.
    expect(envelope.counts['profiles']).toBe(2)
  })

  it('reports the rows it could not carry, and the substitution it made', () => {
    const { stdout } = run(out)
    expect(stdout).toContain('awards_edu 5 date')
    expect(stdout).toContain('achievements 5 achievement')
    expect(stdout).toContain('jobs 3 start_date')
  })

  it('is byte-identical across runs, because the clock comes from the source', () => {
    const first = run(out)
    const second = run(outAgain)
    expect(first.status).toBe(second.status)
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(outAgain, 'utf8'))
    rmSync(out, { force: true })
    rmSync(outAgain, { force: true })
  })

  it('writes nothing on a dry run', () => {
    const dry = resolve(root, 'dry.json')
    const { stdout } = run(dry, ['--dry-run'])
    expect(stdout).toContain('Dry run: nothing was written.')
    expect(existsSync(dry)).toBe(false)
  })
})
