/**
 * `npm run migrate:sqlite` — convert the legacy `career_management.sqlite3`
 * into a document envelope, ready to drop into Dropbox.
 *
 * Reads only the four content tables (MIG5), writes an envelope in the same
 * shape the app itself writes (MIG2), and refuses to write anything it cannot
 * explain (MIG4, MIG7).
 *
 * The database is opened read-only and never touched (MIG3).
 *
 * Usage:
 *   npm run migrate:sqlite -- [options] [path/to/career_management.sqlite3]
 *
 *   --out <file>      Where to write the envelope. Default: the current
 *                     directory, as career-management-document.json.
 *   --report <file>   Where to write the detailed report. Default: beside the
 *                     envelope, as <out>.report.json.
 *   --now <iso>       Pin the clock. Default: the newest timestamp in the source
 *                     database, so two runs over the same file produce the
 *                     same bytes (MIG3).
 *   --dry-run         Report everything and write nothing.
 *   --force           Exit 0 even if records were skipped. Without this, a
 *                     migration that loses anything exits non-zero — which is
 *                     MIG7's whole point.
 */

import { existsSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { parseEnvelope, SCHEMA_VERSION } from '../src/export/envelope'
import { migrate, parseTimestamp } from './migrate/transform'
import type { LegacyRow, LegacyTables } from './migrate/transform'

const DEFAULT_SOURCE = 'career_management.sqlite3'
const DEFAULT_OUT = 'career-management-document.json'

interface Options {
  source: string
  out: string
  report: string
  now: string | null
  dryRun: boolean
  force: boolean
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    source: DEFAULT_SOURCE,
    out: DEFAULT_OUT,
    report: '',
    now: null,
    dryRun: false,
    force: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--out' || arg === '--report') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        fail(`${arg} needs a path.`)
      }
      if (arg === '--out') options.out = value
      else options.report = value
      index += 1
    } else if (arg === '--now') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) fail('--now needs an ISO timestamp.')
      if (Number.isNaN(Date.parse(value))) fail(`--now is not a timestamp: ${value}`)
      options.now = value
      index += 1
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--force') {
      options.force = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith('--')) {
      fail(`Unknown option: ${arg}`)
    } else if (options.source === DEFAULT_SOURCE) {
      options.source = arg
    } else {
      fail(`Too many paths: ${arg}`)
    }
  }

  if (options.report === '') options.report = `${options.out}.report.json`
  return options
}

function fail(message: string): never {
  console.error(`migrate: ${message}\n\nRun with --help for usage.`)
  process.exit(2)
}

function printHelp(): void {
  console.log(`
Convert the legacy career_management.sqlite3 into a document envelope.

  npm run migrate:sqlite -- [options] [source.sqlite3]

Options:
  --out <file>      Envelope destination     (default ${DEFAULT_OUT})
  --report <file>   Detailed report          (default <out>.report.json)
  --now <iso>       Pin the clock            (default: newest timestamp in the source)
  --dry-run         Report, write nothing
  --force           Exit 0 even with skipped records
  -h, --help        Show this

Reads only header, jobs, achievements and awards_edu. Everything else in the
legacy schema is bookkeeping or dead (MIG5).
`)
}

/** Open the source read-only. */
function openDatabase(path: string): DatabaseSync {
  if (!existsSync(path)) fail(`No such file: ${path}`)
  // `mode=ro` in the URI rather than a flag, because it is the one form that
  // cannot be bypassed by a later `open` call and because it fails loudly if the
  // file is not a database at all.
  try {
    return new DatabaseSync(`file:${resolve(path)}?mode=ro`, { open: true })
  } catch (error) {
    fail(`Could not open ${path} as a database: ${String(error)}`)
  }
}

function readTable(db: DatabaseSync, table: string): LegacyRow[] {
  // A fixed allow-list, not an interpolated name: the table list is part of the
  // migration's contract, and a table name that came from anywhere else would
  // make the script read whatever it was pointed at.
  if (!READ_TABLES.has(table)) fail(`Refusing to read unexpected table: ${table}`)
  return db.prepare(`SELECT * FROM "${table}"`).all() as LegacyRow[]
}

const READ_TABLES = new Set(['header', 'jobs', 'achievements', 'awards_edu'])

/**
 * The clock the envelope is dated with.
 *
 * The newest timestamp in the source, not the moment of the run. Two runs over
 * the same input then produce byte-identical output (MIG3), and the document is
 * dated as of the last real edit rather than as of a conversion the user may
 * rerun months later.
 */
function sourceClock(tables: LegacyTables): string {
  let best: string | null = null
  for (const rows of [tables.jobs, tables.achievements, tables.awards_edu, tables.header]) {
    for (const row of rows) {
      for (const field of ['last_update_date', 'creation_date']) {
        const parsed = parseTimestamp(row[field])
        if (parsed !== null && (best === null || parsed > best)) best = parsed
      }
    }
  }
  return best ?? new Date().toISOString()
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))

  const db = openDatabase(options.source)
  let tables: LegacyTables
  try {
    tables = {
      header: readTable(db, 'header'),
      jobs: readTable(db, 'jobs'),
      achievements: readTable(db, 'achievements'),
      awards_edu: readTable(db, 'awards_edu'),
    }
  } finally {
    db.close()
  }

  const now = new Date(options.now ?? sourceClock(tables))

  const { envelope, report } = migrate(tables, now)

  // MIG8: the same validation the app's import path runs. A conversion that
  // produces a file the app refuses is worse than one that fails.
  // The gate the sync path runs, against the version this build writes. Hard-coded,
  // it would start rejecting the tool's own output the moment the layout version
  // moved.
  const parsed = parseEnvelope(envelope, SCHEMA_VERSION)
  if (!parsed.ok) {
    console.error(`migrate: the result is not a valid envelope: ${parsed.message}`)
    process.exit(2)
  }

  if (!options.dryRun) {
    writeFileSync(options.out, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8')
    writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  console.log(`Read ${options.source}`)
  console.log(
    `  ${Object.entries(report.counts)
      .map(([table, count]) => `${count} ${table}`)
      .join(', ')}`,
  )
  console.log()
  for (const note of report.notes) console.log(`  note: ${note}`)

  if (report.substituted.length > 0) {
    console.log()
    console.log(
      `  ${report.substituted.length} record(s) were migrated with a substituted value:`,
    )
    for (const problem of report.substituted) {
      console.log(`    ${problem.table} ${problem.rowId} ${problem.field} — ${problem.reason}`)
    }
  }

  if (report.skipped.length > 0) {
    console.log()
    console.log(`  ${report.skipped.length} record(s) were NOT migrated:`)
    for (const problem of report.skipped) {
      console.log(`    ${problem.table} ${problem.rowId} ${problem.field} — ${problem.reason}`)
    }
  }

  console.log()
  if (options.dryRun) {
    console.log('Dry run: nothing was written. Re-run without --dry-run to produce the file.')
  } else {
    console.log(`Wrote ${options.out}`)
    console.log(`Report: ${options.report}`)
  }

  if (report.skipped.length > 0 || report.substituted.length > 0) {
    console.log()
    if (options.force) {
      console.log('--force was given, so the exit code is 0.')
    } else {
      console.error('Not clean: something was skipped or substituted.')
      console.error(
        'Read the report and either fix the source, or pass --force if you accept it.',
      )
      process.exit(1)
    }
  }
}

main()
