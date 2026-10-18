/**
 * Run the migration CLI over the committed fixture database.
 *
 * Not a vitest test: this is a command, because what it checks is "the CLI, run
 * the way the user runs it, produces the right file". `npm run migrate:fixture`.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname)
const result = spawnSync(
  'node',
  [
    resolve(root, '..', 'run-migration.mjs'),
    resolve(root, 'fixtures', 'legacy.sqlite3'),
    '--out',
    resolve(root, 'fixture-out.json'),
    '--report',
    resolve(root, 'fixture-out.json.report.json'),
  ],
  {
    encoding: 'utf8',
    cwd: resolve(root, '..'),
    env: { ...process.env, TZ: 'Pacific/Auckland' },
  },
)

process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exit(result.status ?? 1)
