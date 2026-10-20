/**
 * The state the two editing pages share.
 *
 * The document's records were split across two pages — the career content on one,
 * the interview questions on the other — and both pages need the same four things:
 * the document model and the options that shape it, the rail that controls those
 * options, the print target, and an undo for the last delete.
 *
 * That was written out twice, which is how the two pages came to disagree: the
 * rules about which records are visible, and about when a story is shown, are the
 * ones a reader would be surprised to find differing between two places that look
 * like the same screen. There is one copy here instead.
 *
 * Every table is subscribed to, whichever page is open, rather than only the ones
 * that page shows. The document model is built from all of them either way — it has
 * to be, because the print button prints the whole document — so this costs no
 * extra reading, and it keeps the hook free of a loop over a variable list of keys,
 * which the rules of hooks have no good answer for.
 */

import { useState, type ReactNode } from 'react'
import { text } from './recordText'
import { useDocument, usePageRule } from './useDocumentSource'
import { deleteRecord, restoreRecord, useFieldContext, useRecords } from '../shared/data'
import { REGISTRY, type RegistryKey } from '../shared/registry'
import type { ExportOptions } from '../../export/model'
import { filterRecords } from '../shared/sort'
import type { Mergeable } from '../../domain/types'

/** A record as it comes back from storage: loose, and narrowed where used. */
export type Row = Mergeable & Record<string, unknown>

/**
 * Newest first, tombstones last.
 *
 * The one order every surface lists in. It is reverse chronological — a job's start
 * date where it has one, and the last time a record changed where it does not — with
 * deleted records after the live ones, because a list of a career should read as the
 * current career first and the record of what was removed after it.
 *
 * Not adjustable, and no longer offered as an option. It is a fact about the data
 * rather than a preference: nobody has ever wanted their oldest role first without
 * also wanting to be told why.
 */
export function inDocumentOrder(records: Mergeable[]): Row[] {
  return [...records]
    .sort((a, b) => {
      if ((a.deletedAt === null) !== (b.deletedAt === null)) {
        return a.deletedAt === null ? -1 : 1
      }
      const left = 'startDate' in a ? String(a['startDate']) : ''
      const right = 'startDate' in b ? String(b['startDate']) : ''
      if (left !== right) return left < right ? 1 : -1
      return a.updatedAt < b.updatedAt ? 1 : -1
    })
    .map((record) => record as unknown as Row)
}

/** What both pages need, from one place. */
export interface EditorState {
  /** The clock, for anything that is stamped when it is written. */
  now: Date
  context: ReturnType<typeof useFieldContext>
  model: ReturnType<typeof useDocument>['model']
  options: ExportOptions
  setOptions: (next: ExportOptions) => void
  settings: ReturnType<typeof useDocument>['settings']
  saveSettings: ReturnType<typeof useDocument>['saveSettings']
  liveProfiles: ReturnType<typeof useDocument>['liveProfiles']
  showStories: boolean
  showDeleted: boolean
  /** The one search box for every section, and the order they are listed in. */
  query: string
  setQuery: (next: string) => void
  /** Every table, keyed, so a page reads only the ones it shows. */
  records: Record<RegistryKey, Row[]>
  /** The same records in document order, which is how a page lists them. */
  ordered: (key: RegistryKey) => Row[]
  /** `records`, minus tombstones unless the rail asked to see them. */
  visible: (records: Row[]) => Row[]
  /** A delete handler that names what it deleted, for the undo message. */
  deleteFrom: (key: RegistryKey) => (id: string) => void
  /** Brings a deleted record back. */
  recoverFrom: (key: RegistryKey) => (id: string) => void
  undo: { key: RegistryKey; id: string; label: string } | null
  restore: () => void
  loading: boolean
}

export function useEditorState(
  options: ExportOptions,
  setOptions: (next: ExportOptions) => void,
  now: Date,
): EditorState {
  const context = useFieldContext(now)

  /*
   * The document, and the options that shape it.
   *
   * The editor is the editing surface; the print target below is what the Print
   * button prints. It is not shown — a second copy of the document beside the
   * editor is a scrolling duplicate of a page the user can already go to — but it
   * is built and kept live, so the button produces the document rather than a
   * printout of the editor. It shares the document page's chrome, so the two print
   * buttons give the same document.
   *
   * The options are the app's, not this page's: a record is edited on a page of
   * its own now, and coming back to the editor has to arrive with the same
   * choices — "include stories" off because it was off a moment ago is a
   * surprise, and one that would happen on every edit.
   */
  const { model, settings, saveSettings, liveProfiles } = useDocument(options, now)
  usePageRule(settings.pageSize)

  /*
   * The last deleted record, so the delete can be taken back.
   *
   * A tombstone is not an absence: the record is still in the database with a
   * `deletedAt`, so undo is a second write rather than a reload, and nothing the
   * user can still see behind "deleted records" is lost.
   */
  const [undo, setUndo] = useState<{ key: RegistryKey; id: string; label: string } | null>(null)

  /*
   * Search and order, for every section at once.
   *
   * One pair of controls rather than one per section, because the question they
   * answer is "where is the thing I am looking for" — and answering that with seven
   * separate boxes is how the answer ends up being "in the one I did not check".
   * Both live here rather than in a page, so the two editing pages cannot come to
   * behave differently.
   *
   * "Document order" is the default, which is a decision rather than an absence:
   * the legacy app ordered jobs by start date in SQL, which nobody chose.
   */
  const [query, setQuery] = useState('')

  const { records: profiles, loading: profilesLoading } = useRecords<Row>('profiles')
  const { records: jobs, loading: jobsLoading } = useRecords<Row>('jobs')
  const { records: achievements, loading: achLoading } = useRecords<Row>('achievements')
  const { records: awards, loading: awardsLoading } = useRecords<Row>('awards')
  const { records: education, loading: eduLoading } = useRecords<Row>('education')
  const { records: categories, loading: catLoading } = useRecords<Row>('questionCategories')
  const { records: questions, loading: qLoading } = useRecords<Row>('questions')

  const loading =
    profilesLoading ||
    jobsLoading ||
    achLoading ||
    awardsLoading ||
    eduLoading ||
    catLoading ||
    qLoading

  /*
   * What the editor pane shows, which the rail controls.
   *
   * Two rules, both taken from the options rather than applied per record type:
   *
   * Stories. Each type used to pick its own preview — a job showed its
   * responsibilities, an achievement showed its story, a category showed its
   * story — so "some stories are shown, some are not" was not a bug in one of
   * them but the rule being absent. Now a story is shown exactly when the
   * document would show it: with stories excluded, no record shows one at all;
   * with them included, every record shows its own. The job also keeps its
   * responsibilities, which is not a story and does not come and go with them.
   *
   * Deleted records. They were always listed, so "show deleted" did nothing — the
   * one state where the toggle should have mattered was the only one it was stuck
   * on. Tombstones are now listed only when asked for, which is what reconciling
   * against another device is for. When they are listed they carry the same
   * marking they get in the document.
   */
  const records: Record<RegistryKey, Row[]> = {
    profiles,
    jobs,
    achievements,
    awards,
    education,
    questionCategories: categories,
    questions,
  }

  const showStories = options.includeStories
  const showDeleted = options.includeDeleted
  const visible = (records: Row[]) =>
    showDeleted ? records : records.filter((record) => text(record, 'deletedAt') === '')

  /**
   * A delete handler for one section.
   *
   * Built from the section's own records so the undo message can name what was
   * deleted, which is the difference between "Deleted achievement" and something
   * the user can act on.
   */
  const deleteFrom =
    (key: RegistryKey, records: Row[]) =>
    (id: string): void => {
      const record = records.find((row) => text(row, 'id') === id)
      void deleteRecord(key, id, now).then(() => {
        setUndo({
          key,
          id,
          label: record ? REGISTRY[key].describe(record, context).heading : 'Record',
        })
      })
    }

  /**
   * Bring a deleted record back.
   *
   * A separate write rather than an undo of the delete, because a deleted record
   * is still in the database with a tombstone on it: clearing the tombstone is
   * the same last-write-wins edit every other change is, and a record restored
   * here resolves the same way whether it came from this device or another.
   */
  const recoverFrom =
    (key: RegistryKey) =>
    (id: string): void => {
      void restoreRecord(key, id, now)
    }

  /**
   * What a section lists: tombstones as asked for, then searched, then ordered.
   *
   * Search reads the two lines the row shows rather than the whole record. The row
   * is what the user is reading, so matching the fields they can see is the honest
   * reading of "find"; matching an id or an `updatedAt` would surface records whose
   * visible text does not explain why they matched.
   */
  const ordered = (key: RegistryKey) => {
    const described = visible(records[key])
    const searched = filterRecords(described, query, (record) => {
      const { heading, detail } = REGISTRY[key].describe(record, context)
      return [heading, detail, text(record, 'story'), text(record, 'answer')].filter(
        (field) => field !== '',
      )
    })
    /*
     * Everything except question categories is a chronology: a job starts on a date,
     * an award is in a year, so newest-first means something. A category is a
     * heading, not an event — Behavioural and Technical have no order but the
     * alphabet — and listing them by when they were created is an accident of use
     * rather than anything the reader asked for. So those alone go A to Z.
     */
    if (key === 'questionCategories') {
      return [...searched].sort((a, b) =>
        REGISTRY[key]
          .describe(a, context)
          .heading.localeCompare(REGISTRY[key].describe(b, context).heading),
      )
    }
    return inDocumentOrder(searched)
  }

  return {
    now,
    context,
    model,
    options,
    setOptions,
    settings,
    saveSettings,
    liveProfiles,
    showStories,
    showDeleted,
    query,
    setQuery,
    records,
    ordered,
    visible,
    deleteFrom: (key) => deleteFrom(key, records[key]),
    recoverFrom,
    undo,
    restore: () => {
      const target = undo
      setUndo(null)
      if (target) void restoreRecord(target.key, target.id, now)
    },
    loading,
  }
}

/**
 * A record's story, or nothing.
 *
 * One shape for every type — a job, an achievement, a category, a question's
 * answer — so a story cannot be italic in one and not in another, or present in
 * one and absent from another, without that being visible here.
 *
 * Returns nothing when stories are excluded, rather than an empty string: the
 * empty string still rendered an empty paragraph, and an empty paragraph is not
 * the same as no preview at all.
 */
export function storyPreview(story: string, showStories: boolean): ReactNode {
  if (!showStories) return null
  const collapsed = collapse(story)
  return collapsed === '' ? null : <p className="inline-row-story">{collapsed}</p>
}

/**
 * Body text onto one line for a preview.
 *
 * Display only. The stored text keeps its paragraph breaks, so the document and
 * the Word export are unaffected — and nothing is truncated here, only in CSS
 * (D31).
 */
export function collapse(value: string): string {
  return value.replace(/\s*\n\s*/g, ' ').trim()
}
