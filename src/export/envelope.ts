/**
 * The synchronised file format.
 *
 * One envelope, three consumers: the sync engine, the local export, and the
 * import path (D4). A separate sync format would be a second schema to maintain
 * and it would drift.
 */

import { z } from 'zod'
import {
  ENTITY_SCHEMAS,
  ENTITY_TABLES,
  type EntityTableName,
  type Mergeable,
  type Snapshot,
} from '../domain/types'

/** Identifies the file as ours, so a stray JSON import is rejected cleanly. */
export const FORMAT = 'career-management-document'
/**
 * Bumped only on a breaking change to this wrapper — a new required top-level
 * field, or a rename. A change that only adds fields goes in `schemaVersion`.
 */
export const FORMAT_VERSION = 1

/**
 * The document layout version.
 *
 * Separate from the app version and from the file format, because an older build
 * has to be able to recognise a newer document and refuse it (D7) rather than
 * interpret what it does not understand.
 */
export const SCHEMA_VERSION = 1

const isoInstant = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'must be an ISO instant',
})

/**
 * One entity table.
 *
 * `looseObject`, not `object`, and that is the load-bearing choice (D6). A plain
 * Zod object *strips* unknown keys, so a document written by a later build and
 * synced into an older one would silently lose every field that build added —
 * which is the quietest way there is to destroy someone's data. Passing unknown
 * fields through lets an older build carry a newer build's file intact.
 *
 * The id is checked for *shape* here — it must be a string — but not for
 * emptiness. This gate answers "is this our file, and is it whole?"; whether a
 * particular record is *usable* is `narrowTables`' question, and it can report it.
 * Validating the id strictly here meant one record with a blank id made the
 * entire document unreadable, which turned a repairable problem into a dead end:
 * sync refused to run, so the broken record could never be fixed by syncing.
 */
const entityTable = z.array(z.looseObject({ id: z.string() })).default([])

const entityTables = {
  settings: entityTable,
  profiles: entityTable,
  jobs: entityTable,
  achievements: entityTable,
  awards: entityTable,
  education: entityTable,
  questionCategories: entityTable,
  questions: entityTable,
}

export const envelopeSchema = z.object({
  format: z.literal(FORMAT),
  formatVersion: z.number().int().positive(),
  schemaVersion: z.number().int().nonnegative(),
  exportedAt: isoInstant,
  /**
   * Record counts, written by the exporter and checked by the reader.
   *
   * This is the half that catches a file truncated by a storage quota, an
   * interrupted upload, or a hand edit (D8). Without it, a half-written file
   * parses cleanly and the missing records look like records the user deleted.
   */
  counts: z.record(z.string(), z.number().int().nonnegative()),
  data: z.object(entityTables),
})

export type Envelope = z.infer<typeof envelopeSchema>

export type ParseResult = { ok: true; snapshot: Snapshot } | { ok: false; message: string }

/**
 * Validate a parsed JSON value as a document envelope.
 *
 * Every gate fails closed. Nothing is written and nothing is interpreted until
 * the whole file has passed, because a partially-understood document is one step
 * away from being overwritten with a worse version of itself.
 */
export function parseEnvelope(raw: unknown, supportedSchemaVersion: number): ParseResult {
  // A non-object here is the common case — someone picked the wrong file — so it
  // gets a plain message rather than a Zod issue list about object shapes.
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'Not a career management document file.' }
  }

  const candidate = raw as Record<string, unknown>

  if (candidate['format'] !== FORMAT) {
    return { ok: false, message: 'Not a career management document file.' }
  }

  const formatVersion = candidate['formatVersion']
  if (typeof formatVersion === 'number' && formatVersion > FORMAT_VERSION) {
    return { ok: false, message: 'This file was written by a newer version of the app.' }
  }

  const parsed = envelopeSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.join('.')
      return `${path === '' ? '(root)' : path}: ${issue.message}`
    })
    return {
      ok: false,
      message: `This file is not a valid document: ${issues.slice(0, 5).join('; ')}`,
    }
  }

  const envelope = parsed.data

  if (envelope.schemaVersion > supportedSchemaVersion) {
    return {
      ok: false,
      message: `This document uses layout version ${envelope.schemaVersion}, but this version of the app understands up to ${supportedSchemaVersion}. Update the app and try again.`,
    }
  }

  // Counts are only checked for tables this build actually parsed. A table absent
  // from a file written by an older build means "did not exist then", not "empty".
  const issues: string[] = []
  for (const name of ENTITY_TABLES) {
    const declared = envelope.counts[name]
    const table = envelope.data[name]
    if (declared === undefined) continue
    if (table !== undefined && declared !== table.length) {
      issues.push(`${name}: says ${String(declared)}, has ${String(table.length)}`)
    }
  }
  if (issues.length > 0) {
    return {
      ok: false,
      message: `This file is incomplete: it says it contains records that are not there (${issues.join('; ')}).`,
    }
  }

  return { ok: true, snapshot: toSnapshot(envelope, supportedSchemaVersion) }
}

/**
 * Validate each table against its own schema and narrow it.
 *
 * A record that fails its table's schema is a real question rather than a
 * formatting one: the envelope gate above only checks shape, because a
 * `looseObject` cannot validate fields it does not know about. A record that
 * fails here is dropped and reported by the caller, never silently kept.
 */
export function narrowTables(snapshot: Snapshot): {
  entities: Snapshot['entities']
  rejected: { table: EntityTableName; id: string; reason: string }[]
} {
  const entities = {} as Snapshot['entities']
  const rejected: { table: EntityTableName; id: string; reason: string }[] = []

  for (const name of ENTITY_TABLES) {
    const schema = ENTITY_SCHEMAS[name]
    const kept: Snapshot['entities'][EntityTableName] = []
    for (const record of snapshot.entities[name]) {
      const result = schema.safeParse(record)
      if (result.success) {
        kept.push(result.data)
      } else {
        const first = result.error.issues[0]
        rejected.push({
          table: name,
          id: record.id,
          reason: first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'invalid',
        })
      }
    }
    entities[name] = kept
  }

  return { entities, rejected }
}

/** Strip the wrapper off an envelope, giving the merge engine what it expects. */
export function toSnapshot(envelope: Envelope, schemaVersion: number): Snapshot {
  const entities = {} as Snapshot['entities']
  for (const name of ENTITY_TABLES) {
    /**
     * The envelope's tables are validated for `id` only, because they are
     * `looseObject`s and a reader cannot validate fields it does not know about
     * (D6). Full validation is `narrowTables`, below; this is the step that hands
     * the merge engine something with the shape it needs.
     */
    entities[name] = (envelope.data[name] ?? []) as unknown as Mergeable[]
  }
  return { schemaVersion, entities }
}

/**
 * Wrap a snapshot back into an envelope.
 *
 * `counts` is computed from the tables actually present, so a file this build
 * writes is indistinguishable from one written before a table existed — which is
 * what makes the counts check above meaningful rather than noisy.
 */
export function toEnvelope(snapshot: Snapshot, now: Date): Envelope {
  const data = {} as Envelope['data']
  const counts: Record<string, number> = {}

  for (const name of ENTITY_TABLES) {
    const table = snapshot.entities[name] ?? []
    // The same cast as `toSnapshot`, in the other direction. The envelope's
    // tables are `looseObject`s, so they are structurally compatible with any
    // record; `narrowTables` is what enforces the per-table shape.
    data[name] = table as unknown as Envelope['data'][typeof name]
    counts[name] = table.length
  }

  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: snapshot.schemaVersion,
    exportedAt: now.toISOString(),
    counts,
    data,
  }
}

/** Compact: these files are synced on every change, and newlines triple the size. */
export function serialiseEnvelope(envelope: Envelope): string {
  return JSON.stringify(envelope)
}

/**
 * Build the initial settings row.
 *
 * Called on first run so there is always exactly one, rather than making every
 * reader cope with "no settings yet".
 */
export function defaultSettings(now: Date) {
  return {
    id: 'settings',
    updatedAt: now.toISOString(),
    deletedAt: null,
    activeProfileId: null,
    pageSize: 'A4' as const,
    fontSizePt: 10,
    density: 'normal' as const,
    targetPages: 1,
  }
}
