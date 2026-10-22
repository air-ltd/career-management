/**
 * The templates, and choosing between them.
 *
 * A template is a named set of document settings (D54). Choosing one copies its
 * settings into the document; it does not touch a record (D56) — the achievements,
 * jobs and stories are not part of it.
 *
 * The built-in template is the one the app has always produced, so an existing
 * user's first load looks exactly like their previous load: a template is a
 * choice, never a surprise on upgrade.
 */

import { bumpRevision, db } from '../../storage/db'
import { restore } from '../../storage/repository'
import { BUILT_IN_TEMPLATE_ID, builtInTemplate, templateSettings } from '../../domain/templates'
import type { Settings, Template } from '../../domain/types'

/**
 * Make sure the built-in template is there.
 *
 * Written by the app rather than by the database upgrade, so that a database
 * created by an older build and one created by this build end up with exactly
 * the same template — and so that the seeded row is the one every device agrees
 * on, rather than one that was frozen into a migration.
 */
export async function ensureBuiltInTemplate(now: Date): Promise<void> {
  const existing = await db.templates.get(BUILT_IN_TEMPLATE_ID)
  if (existing !== undefined) return
  await db.templates.put(builtInTemplate(now))
  bumpRevision()
}

/** The templates, oldest first so the list does not jump about as they are added. */
export async function listTemplates(): Promise<Template[]> {
  const rows = await db.templates.toArray()
  return rows
    .filter((row) => row.deletedAt === null)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** Write a template. */
export async function saveTemplate(template: Template, now: Date): Promise<void> {
  await db.templates.put({ ...template, updatedAt: now.toISOString() })
  bumpRevision()
}

/**
 * Delete a template.
 *
 * A tombstone rather than a removal, like every other delete in the app: a
 * template deleted on one device must not come back on another (D51).
 */
export async function deleteTemplate(id: string, now: Date): Promise<void> {
  const existing = await db.templates.get(id)
  if (existing === undefined) return
  await db.templates.put({ ...existing, deletedAt: now.toISOString() })
  bumpRevision()
}

/** Bring a deleted template back. */
export async function restoreTemplate(id: string, now: Date): Promise<void> {
  await restore(db.templates, id, now)
}

/**
 * The settings a template is showing.
 *
 * A template that is not the one in use is not "current" — the current document
 * is whatever the settings say it is, and a template is a set of settings that
 * may or may not match it.
 */
export function matchesTemplate(template: Template, settings: Settings): boolean {
  // Both sides are normalised the same way, so a document that has never been
  // given a section order compares equal to a template that carries the default
  // one — which it is, as far as the document is concerned.
  const wanted = templateSettings(template)
  const actual = templateSettings(settings)
  return (
    wanted.pageSize === actual.pageSize &&
    wanted.fontSizePt === actual.fontSizePt &&
    wanted.density === actual.density &&
    wanted.format === actual.format &&
    wanted.targetPages === actual.targetPages &&
    sameOrder(wanted.sectionOrder, actual.sectionOrder) &&
    sameOrder(wanted.sections, actual.sections) &&
    sameHeadings(wanted.sectionHeadings, actual.sectionHeadings)
  )
}

function sameOrder(wanted: string[] | undefined, actual: string[] | undefined): boolean {
  const left = wanted ?? []
  const right = actual ?? []
  if (left.length !== right.length) return false
  return left.every((key, index) => key === right[index])
}

function sameHeadings(
  wanted: Record<string, string> | undefined,
  actual: Record<string, string> | undefined,
): boolean {
  const right = actual ?? {}
  const wantedKeys = Object.keys(wanted ?? {})
  const actualKeys = Object.keys(right)
  if (wantedKeys.length !== actualKeys.length) return false
  return wantedKeys.every((key) => (wanted ?? {})[key] === right[key])
}
