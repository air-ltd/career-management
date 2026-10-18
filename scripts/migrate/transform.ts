/**
 * The legacy SQLite database, turned into a document envelope.
 *
 * Every rule the conversion follows is written down in `specs/0001-plan.md` §10.3,
 * and each one exists because the two data models genuinely differ — not because
 * a transformation was convenient. The transformations that matter:
 *
 * - `jobs.questions = 1` was a question category wearing a job's schema (D19), and
 *   the achievements under it were prepared questions, not achievements.
 * - Job dates were `YYYYMMDD` text parsed with `strptime` that could raise (L5).
 * - Text columns hold HTML entities the legacy renderer escaped and never
 *   unescaped (L6), so a name can read `Jared &amp; Church`.
 * - `obsolete` is a boolean with no timestamp, so there is no honest `deletedAt`.
 *
 * This module is pure: it takes rows and a clock and returns an envelope and a
 * report. Nothing here opens a database or writes a file, so every rule above is
 * testable without one — which is the only reason to separate them.
 */

import {
  FORMAT,
  FORMAT_VERSION,
  SCHEMA_VERSION,
  defaultSettings,
} from '../../src/export/envelope'
import { ENTITY_TABLES } from '../../src/domain/types'
import type { Envelope } from '../../src/export/envelope'

/** A row as SQLite hands it back: every column is `unknown`. */
export type LegacyRow = Record<string, unknown>

export interface LegacyTables {
  header: LegacyRow[]
  jobs: LegacyRow[]
  achievements: LegacyRow[]
  awards_edu: LegacyRow[]
}

/** Something the conversion could not carry across, or had to guess at. */
export interface MigrationProblem {
  table: string
  /** The primary key of the row, so the user can find it in the legacy app. */
  rowId: string
  field: string
  value: unknown
  reason: string
  /**
   * Whether the record was still migrated, with something substituted.
   *
   * `true` means the user should look at this row after importing. `false` means
   * the record did not survive and the count will be short.
   */
  substituted: boolean
}

export interface MigrationReport {
  counts: Record<string, number>
  /** Rows deliberately not migrated at all. */
  skipped: MigrationProblem[]
  /** Rows migrated, but with a value the converter had to choose. */
  substituted: MigrationProblem[]
  /** Things worth saying that are not about a particular row. */
  notes: string[]
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Undo the entity escaping the legacy app applied and never undid.
 *
 * `&amp;` is decoded **last**, and that ordering is the whole trick. Decoding it
 * first would turn the stored text `&amp;lt;` into `<`, silently manufacturing
 * markup that was never in the source. Decoded in this order it becomes `&lt;`,
 * which is what the user actually typed.
 *
 * Run once. The legacy app re-escaped on every save, so some rows are escaped
 * twice; decoding twice here would turn `&amp;amp;` into `&`, which is one level
 * too many. The right answer for a double-escaped row is to fix it by hand, and
 * it is visible rather than silent.
 */
export function decodeEntities(value: string): string {
  const once = value
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0*60;/g, '<')
    .replace(/&#0*62;/g, '>')
    .replace(/&#0*37;/g, '%')
  return once.replace(/&amp;/g, '&')
}

// ---------------------------------------------------------------------------
// Dates and numbers
// ---------------------------------------------------------------------------

/**
 * `YYYYMMDD` to `YYYY-MM-DD`, or null when it is not that.
 *
 * Null rather than a guess. `strptime` on stored text was the 500 in L5, and the
 * honest answer to a date this cannot read is to say so — the record is still
 * reported and the user decides.
 *
 * The calendar is checked, so `20240231` is rejected rather than becoming the
 * 2nd of March.
 */
export function parseLegacyDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{8}$/.test(trimmed)) return null
  const year = Number(trimmed.slice(0, 4))
  const month = Number(trimmed.slice(4, 6))
  const day = Number(trimmed.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
}

/**
 * A job's end date, or null for a current role.
 *
 * Both `''` and `NULL` mean "present". The legacy app tested for `''` only, so a
 * null reached `strptime(None, …)` and raised (L3); accepting both is the fix.
 */
export function legacyEndDate(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  if (value.trim() === '') return null
  return parseLegacyDate(value)
}

/** A four-digit year, or null. Guards the nonsense the legacy form allowed. */
export function parseYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value >= 1900 && value <= 2200 ? value : null
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{4}$/.test(trimmed)) return null
  const year = Number(trimmed)
  return year >= 1900 && year <= 2200 ? year : null
}

/**
 * A legacy timestamp as an ISO instant.
 *
 * Three formats occur in real data, and only the first two are dates at all:
 *
 * - `2018-04-08 19:41:00` — SQLite's `current_timestamp`, UTC, no zone marker.
 * - `20180408T194100` — what the app's own forms wrote.
 * - `0m0p3uiq436gb3ipiqs3jpq0n2` — what a database-migration bug left behind in
 *   `awards_edu.creation_date`. Not a date, and not recoverable.
 *
 * The first two are read as UTC because that is what SQLite's `current_timestamp`
 * means, and the app wrote its own stamps in the same clock.
 */
export function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  const sqlite = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(trimmed)
  if (sqlite !== null) {
    const parsed = new Date(`${sqlite[1]}T${sqlite[2]}Z`)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const basic = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(trimmed)
  if (basic !== null) {
    const [, y, m, d, hh, mm, ss] = basic
    const parsed = new Date(
      Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)),
    )
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  const iso = Date.parse(trimmed)
  return Number.isNaN(iso) ? null : new Date(iso).toISOString()
}

/**
 * When a record was last edited.
 *
 * `last_update_date` wins; `creation_date` is the fallback; the migration's own
 * clock is the last resort.
 *
 * `exact` says whether the preferred field was the one that produced the value,
 * and it is false for *both* fallbacks. That matters more than it looks:
 * `updatedAt` decides the "Recently edited" order and, on the next sync, which
 * of two edits wins. A record dated from its creation date is ordered wrongly and
 * would quietly win or lose a merge against a real edit, so it is reported rather
 * than absorbed.
 */
export function recordUpdatedAt(
  row: LegacyRow,
  fallback: string,
): { value: string; exact: boolean } {
  const updated = parseTimestamp(row['last_update_date'])
  if (updated !== null) return { value: updated, exact: true }
  const created = parseTimestamp(row['creation_date'])
  if (created !== null) return { value: created, exact: false }
  return { value: fallback, exact: false }
}

// ---------------------------------------------------------------------------
// Awards and education
// ---------------------------------------------------------------------------

/**
 * Whether an `awards_edu` row is an award or a piece of education.
 *
 * `type` was sometimes null and was then silently coerced to `'award'` (L13), which
 * filed a degree as a prize with no indication anything had happened. So a null
 * type is resolved against the text, and when the text is not decisive the row is
 * reported and defaulted — loudly, which is the part L13 was missing.
 */
const EDUCATION_PATTERN =
  /\b(university|college|school|institute|polytechnic|degree|bachelor|master|postgrad|post-grad|diploma|phd|cert|certificate|course|training)\b/i

export function classifyAwardEducation(
  type: unknown,
  what: unknown,
  institution: unknown,
): { kind: 'award' | 'education'; guessed: boolean } {
  if (typeof type === 'string') {
    const lowered = type.trim().toLowerCase()
    if (lowered === 'award') return { kind: 'award', guessed: false }
    if (lowered === 'education') return { kind: 'education', guessed: false }
  }
  const haystack = `${typeof what === 'string' ? what : ''} ${typeof institution === 'string' ? institution : ''}`
  return { kind: EDUCATION_PATTERN.test(haystack) ? 'education' : 'award', guessed: true }
}

// ---------------------------------------------------------------------------
// The conversion
// ---------------------------------------------------------------------------

/** SQLite integers arrive as numbers; ids in the envelope are strings. */
function rowId(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return ''
}

/** Text columns are `BLOB`-declared and nullable; both `NULL` and `''` mean "". */
function text(value: unknown): string {
  if (typeof value === 'string') return decodeEntities(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function deletedAt(row: LegacyRow, migratedAt: string): string | null {
  const obsolete = row['obsolete']
  // Both 1 and any truthy non-zero, because the column is an untyped SQLite
  // INTEGER and L13's family of bugs is exactly this: the type does not check.
  return obsolete === null || obsolete === undefined || Number(obsolete) === 0
    ? null
    : migratedAt
}

/**
 * A mutable accumulator for the envelope's tables.
 *
 * Typed as `unknown[]` rather than the narrow entity types so that nothing in this
 * module needs a non-null assertion to push to it, and so that the `!` on
 * `tables['jobs'].push(...)` — which the lint rules treat as a smell in a way that
 * hides a real bug — is not the thing holding the whole thing together.
 */
function emptyEntities(): Record<string, unknown[]> {
  const entities: Record<string, unknown[]> = {}
  for (const table of ENTITY_TABLES) entities[table] = []
  return entities
}

export interface MigrationResult {
  envelope: Envelope
  report: MigrationReport
}

/**
 * Convert the legacy tables into an envelope.
 *
 * `migratedAt` is passed in rather than read from the clock so the same input
 * always produces the same output — the spec's idempotence gate compares two runs
 * byte for byte.
 */
export function migrate(legacy: LegacyTables, now: Date): MigrationResult {
  const migratedAt = now.toISOString()
  const data: Record<string, unknown[]> = emptyEntities()
  const skipped: MigrationProblem[] = []
  const substituted: MigrationProblem[] = []
  const notes: string[] = []

  // --- jobs, first: everything else refers to one ---
  /**
   * Which legacy jobs were really question categories.
   *
   * Kept as a set of ids rather than a second pass so that "is this achievement a
   * question?" is answered by the same fact everywhere, in one place.
   */
  const questionCategoryIds = new Set<string>()
  /**
   * The real jobs that survive this migration.
   *
   * The fallback parent is chosen from *these*, not from the table: picking the
   * highest job id without checking whether that job was dropped would attach an
   * orphan to a job that is not in the envelope, and the achievement would then
   * fail validation on import rather than being visible as a problem here.
   */
  const survivingJobIds = new Set<string>()

  for (const row of legacy.jobs) {
    const id = rowId(row['job_id'])
    const updated = recordUpdatedAt(row, migratedAt)
    const deleted = deletedAt(row, migratedAt)
    const story = text(row['job_story'])
    const isQuestionCategory = Number(row['questions']) === 1

    if (!updated.exact) {
      substituted.push({
        table: 'jobs',
        rowId: id,
        field: 'last_update_date',
        value: row['last_update_date'],
        reason: 'Neither last_update_date nor creation_date was a readable date.',
        substituted: true,
      })
    }

    if (isQuestionCategory) {
      questionCategoryIds.add(id)
      const category = {
        id,
        updatedAt: updated.value,
        deletedAt: deleted,
        title: text(row['company']),
        story,
      }
      if (category.title === '') {
        skipped.push({
          table: 'jobs',
          rowId: id,
          field: 'company',
          value: row['company'],
          reason:
            'This row was a question category (questions = 1) but has no company to name it. A category with no title cannot be selected, so it was not migrated.',
          substituted: false,
        })
        continue
      }
      /*
       * What was actually lost from this row.
       *
       * `company` becomes the category title and `job_story` becomes its story, so
       * both survive. The title and the two dates have no question-category
       * equivalent and are discarded (D19) — and that is reported only when there
       * was something to discard.
       */
      const discarded: string[] = []
      if (text(row['job_title']) !== '') discarded.push('its title')
      if (parseLegacyDate(row['start_date']) !== null) discarded.push('its start date')
      if (rawDateIsUnreadable(row['end_date'])) discarded.push('its end date')
      if (discarded.length > 0) {
        substituted.push({
          table: 'jobs',
          rowId: id,
          field: 'job_title',
          value: row['job_title'],
          reason: `A question-category row carries a job's schema, and ${discarded.join(
            ', ',
          )} have no equivalent on a category (D19). The company became the title and the story became the category's story.`,
          substituted: true,
        })
      }
      data['questionCategories'].push(category)
      continue
    }

    const startDate = parseLegacyDate(row['start_date'])
    if (startDate === null) {
      skipped.push({
        table: 'jobs',
        rowId: id,
        field: 'start_date',
        value: row['start_date'],
        reason: 'The start date was not YYYYMMDD, and a job cannot be shown without one.',
        substituted: false,
      })
      continue
    }

    const rawEnd = row['end_date']
    const endDate = legacyEndDate(rawEnd)
    if (rawDateIsUnreadable(rawEnd)) {
      substituted.push({
        table: 'jobs',
        rowId: id,
        field: 'end_date',
        value: rawEnd,
        reason:
          'The end date was neither empty nor YYYYMMDD, so this role is shown as current.',
        substituted: true,
      })
    }

    data['jobs'].push({
      id,
      updatedAt: updated.value,
      deletedAt: deleted,
      startDate,
      endDate,
      company: text(row['company']),
      jobTitle: text(row['job_title']),
      // `responsibilities` is one of the columns the orphaned `responsibilities`
      // table duplicates; the column on the job is the live one.
      responsibilities: text(row['responsibilities']),
      story,
    })
    survivingJobIds.add(id)
  }

  // --- achievements: a question under a category, an achievement under a job ---
  /**
   * The fallback parent for an achievement with no job.
   *
   * The legacy app did this at every read, which is why it is done once here and
   * made visible (L4). Nothing in this database needs it; if a row ever does, the
   * report says which parent it was attached to rather than guessing silently.
   */
  const fallbackJobId = findFallbackJobId(survivingJobIds)
  const fallbackUsed: string[] = []

  for (const row of legacy.achievements) {
    const id = rowId(row['achievement_id'])
    const updated = recordUpdatedAt(row, migratedAt)
    if (!updated.exact) {
      substituted.push({
        table: 'achievements',
        rowId: id,
        field: 'last_update_date',
        value: row['last_update_date'],
        reason: 'Neither last_update_date nor creation_date was a readable date.',
        substituted: true,
      })
    }

    let parentId =
      row['job_id'] === null || row['job_id'] === undefined ? '' : rowId(row['job_id'])
    if (parentId === '') {
      if (fallbackJobId === null) {
        skipped.push({
          table: 'achievements',
          rowId: id,
          field: 'job_id',
          value: row['job_id'],
          reason: 'This achievement has no job, and there is no job to attach it to.',
          substituted: false,
        })
        continue
      }
      parentId = fallbackJobId
      fallbackUsed.push(id)
    }

    const body = text(row['achievement'])
    const story = text(row['story'])
    const deleted = deletedAt(row, migratedAt)

    if (questionCategoryIds.has(parentId)) {
      if (body === '') {
        skipped.push({
          table: 'achievements',
          rowId: id,
          field: 'achievement',
          value: row['achievement'],
          reason: 'This prepared question has no text and cannot be shown.',
          substituted: false,
        })
        continue
      }
      data['questions'].push({
        id,
        updatedAt: updated.value,
        deletedAt: deleted,
        categoryId: parentId,
        question: body,
        answer: story,
      })
      continue
    }

    if (body === '') {
      skipped.push({
        table: 'achievements',
        rowId: id,
        field: 'achievement',
        value: row['achievement'],
        reason: 'This achievement has no text and cannot be shown.',
        substituted: false,
      })
      continue
    }
    data['achievements'].push({
      id,
      updatedAt: updated.value,
      deletedAt: deleted,
      jobId: parentId,
      achievement: body,
      story,
    })
  }

  // --- awards and education ---
  for (const row of legacy.awards_edu) {
    const id = rowId(row['award_edu_id'])
    const updated = recordUpdatedAt(row, migratedAt)
    if (!updated.exact) {
      substituted.push({
        table: 'awards_edu',
        rowId: id,
        field: 'last_update_date',
        value: row['last_update_date'],
        reason: 'Neither last_update_date nor creation_date was a readable date.',
        substituted: true,
      })
    }

    const year = parseYear(row['date'])
    if (year === null) {
      // This is the case that matters: the real database has rows whose every
      // column is the literal string "None", which a legacy form submitted. There
      // is no year, so there is nothing to show.
      skipped.push({
        table: 'awards_edu',
        rowId: id,
        field: 'date',
        value: row['date'],
        reason:
          'The year is missing or unreadable. An award or education entry with no year cannot be placed in the document.',
        substituted: false,
      })
      continue
    }

    const institution = text(row['institution'])
    const what = text(row['what'])
    const classified = classifyAwardEducation(row['type'], what, institution)
    if (classified.guessed) {
      substituted.push({
        table: 'awards_edu',
        rowId: id,
        field: 'type',
        value: row['type'],
        reason: `The type was missing or unrecognised; filed as ${classified.kind} from its text. The legacy app defaulted this silently (L13).`,
        substituted: true,
      })
    }

    const entry = {
      id,
      updatedAt: updated.value,
      deletedAt: deletedAt(row, migratedAt),
      year,
      institution,
      what,
      story: text(row['story']),
    }
    if (classified.kind === 'education') {
      data['education'].push(entry)
    } else {
      data['awards'].push(entry)
    }
  }

  // --- header rows become profiles ---
  /**
   * The profile the document uses.
   *
   * The legacy app seeded exactly two rows, `domestic` and `international`, and
   * treated `domestic` as the default. Carrying that forward means the migrated
   * document is the same one the legacy export produced, which is the point of a
   * migration.
   */
  let domesticProfileId: string | null = null
  for (const row of legacy.header) {
    const id = rowId(row['header_id'])
    const updated = recordUpdatedAt(row, migratedAt)
    if (!updated.exact) {
      substituted.push({
        table: 'header',
        rowId: id,
        field: 'last_update_date',
        value: row['last_update_date'],
        reason: 'Neither last_update_date nor creation_date was a readable date.',
        substituted: true,
      })
    }
    const name = text(row['name'])
    data['profiles'].push({
      id,
      updatedAt: updated.value,
      deletedAt: deletedAt(row, migratedAt),
      name,
      title: text(row['title']),
      email: text(row['email']),
      address: text(row['address']),
      phone: text(row['phone']),
    })
    if (name.toLowerCase() === 'domestic') domesticProfileId = id
  }

  if (data['profiles']!.length === 0) {
    notes.push(
      'The legacy database has no header rows, so there are no profiles. Add one in the app before printing.',
    )
  } else if (domesticProfileId === null) {
    notes.push(
      'No header row named "domestic" was found, so no profile is preselected. Choose one in the app; it will not export as a blank header once chosen.',
    )
  }

  data['settings'].push({ ...defaultSettings(now), activeProfileId: domesticProfileId })

  if (fallbackUsed.length > 0) {
    notes.push(
      `${fallbackUsed.length} achievement(s) had no job and were attached to job ${fallbackJobId}: ${fallbackUsed.join(', ')}. Check they belong there.`,
    )
  }

  const counts: Record<string, number> = {}
  for (const table of ENTITY_TABLES) counts[table] = (data[table] ?? []).length

  const envelope: Envelope = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: migratedAt,
    counts,
    data: data as unknown as Envelope['data'],
  }

  return {
    envelope,
    report: { counts, skipped, substituted, notes },
  }
}

/**
 * The job an unparented achievement is attached to: the highest-numbered real job.
 *
 * "Real" meaning not a question category — a question attached to another
 * question would be nonsense, and the highest id is the one the legacy app used.
 */
function findFallbackJobId(surviving: ReadonlySet<string>): string | null {
  let best: string | null = null
  let bestNumber = -Infinity
  for (const id of surviving) {
    const numeric = Number(id)
    if (Number.isFinite(numeric) && numeric > bestNumber) {
      bestNumber = numeric
      best = id
    }
  }
  return best
}

/** Whether an end date was present but unreadable, as opposed to absent. */
function rawDateIsUnreadable(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value !== 'string') return false
  if (value.trim() === '') return false
  return parseLegacyDate(value) === null
}
