/**
 * The entity registry.
 *
 * One place where each record's table, fields and routes are described. Adding a
 * field means adding a descriptor here; it does not mean editing a form, a list
 * and a migration separately and hoping they agree.
 *
 * The list and form components are generic over this, which is what makes the
 * "no field that nothing reads" rule (D9) enforceable — a field is defined once,
 * and the storage schema, the envelope and the migration all derive from the
 * same descriptions elsewhere in the code.
 */

import { db } from '../../storage/db'
import { currentYear, formatDateRange, formatYear } from '../../domain/format'
import type { Field, SelectOption } from './fields'
import type {
  Achievement,
  Award,
  Education,
  EntityTableName,
  Job,
  Mergeable,
  Profile,
  Question,
  QuestionCategory,
} from '../../domain/types'

/**
 * A row as it arrives from Dexie.
 *
 * Dexie's `table()` is typed by argument, and the generic list view cannot know
 * which of the seven tables it was handed, so rows cross this boundary loose.
 * Each definition narrows once, via the helpers below. That is sound because
 * every write goes through the entity schema in `domain/types`, which is what
 * actually guarantees a `Job` has a `company`.
 */
type Row = Mergeable & Record<string, unknown>

function as<T>(row: Row): T {
  return row as unknown as T
}

export interface EntityDefinition {
  /** Singular, for a record: "Job". */
  singular: string
  /** Plural, for a list: "Jobs". */
  plural: string
  table: EntityTableName
  /**
   * Where "back" goes, and where a saved record returns to.
   *
   * Not always a list of its own: for achievements, awards and education the list
   * route was removed, because the all-in-one editor is where those records are
   * created and edited (D10). Those entities point here so that saving a record
   * from a per-record edit route still returns the user to somewhere they can see
   * it, rather than to a route that no longer exists.
   */
  listPath: string
  /**
   * The new-record route, or absent when there is none.
   *
   * Optional because an entity reached only through the all-in-one editor has no
   * standalone form to go to. Leaving a path here that resolves to nothing is how
   * a dead link survives for years.
   */
  newPath?: string
  /** The edit route for one record. */
  editPath: (id: string) => string
  fields: (context: FieldContext) => readonly Field[]
  /** The two lines a list row shows. */
  describe: (record: Row, context: FieldContext) => { heading: string; detail: string }
}

export interface FieldContext {
  /** Jobs, for the achievement's parent dropdown. */
  jobs: Job[]
  /** Question categories, for the question's parent dropdown. */
  questionCategories: QuestionCategory[]
  now: Date
}

function jobOptions(jobs: readonly Job[]): SelectOption[] {
  return jobs
    .filter((job) => job.deletedAt === null)
    .map((job) => ({
      value: job.id,
      label: `${job.company} - ${job.jobTitle}`,
    }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
}

function categoryOptions(categories: readonly QuestionCategory[]): SelectOption[] {
  return categories
    .filter((category) => category.deletedAt === null)
    .map((category) => ({ value: category.id, label: category.title }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
}

export const profiles: EntityDefinition = {
  singular: 'Profile',
  plural: 'Profiles',
  table: 'profiles',
  listPath: '/profiles',
  newPath: '/profiles/new',
  editPath: (id) => `/profiles/${id}/edit`,
  fields: () => [
    {
      kind: 'text',
      name: 'name',
      label: 'Name',
      required: true,
      hint: 'How you refer to this profile, e.g. "Domestic" or "New Zealand".',
    },
    { kind: 'text', name: 'title', label: 'Title' },
    { kind: 'text', name: 'email', label: 'Email' },
    { kind: 'textarea', name: 'address', label: 'Address', rows: 4 },
    { kind: 'text', name: 'phone', label: 'Phone' },
  ],
  describe: (row) => {
    const record = as<Profile>(row)
    return {
      heading: record.name || '(unnamed profile)',
      detail: record.email,
    }
  },
}

export const jobs: EntityDefinition = {
  singular: 'Job',
  plural: 'Jobs',
  table: 'jobs',
  // As for achievements, awards and education: the all-in-one editor is where jobs
  // are created and listed, so there is no jobs list to return to and no standalone
  // form to go to. The per-record edit route stays, for the same reason theirs do.
  listPath: '/',
  editPath: (id) => `/jobs/${id}/edit`,
  fields: () => [
    {
      kind: 'checkbox',
      name: 'hideDetail',
      label: 'Hide responsibilities and achievements from the document',
      hint: 'Keeps the role as one line — company, title and dates — without the detail under it. The editor still shows everything.',
    },
    {
      kind: 'text',
      name: 'company',
      label: 'Company',
      required: true,
    },
    { kind: 'text', name: 'jobTitle', label: 'Job title' },
    // The stored value is a full date (D17); the document shows "Jan 2024".
    { kind: 'date', name: 'startDate', label: 'Start date', required: true },
    {
      kind: 'date',
      name: 'endDate',
      label: 'End date',
      hint: 'Leave empty for a current role. The document shows this as "present".',
    },
    {
      kind: 'textarea',
      name: 'responsibilities',
      label: 'Responsibilities',
      hint: 'Plain text. Blank lines become paragraph breaks in the document.',
    },
    {
      kind: 'textarea',
      name: 'story',
      label: 'Story',
      hint: 'Interview preparation. Left out of the CV document and included in the preparation document.',
    },
  ],
  describe: (row) => {
    const record = as<Job>(row)
    return {
      heading: `${record.company} - ${record.jobTitle}`,
      detail: formatDateRange(record.startDate, record.endDate),
    }
  },
}

export const achievements: EntityDefinition = {
  singular: 'Achievement',
  plural: 'Achievements',
  table: 'achievements',
  // No list route of its own; the all-in-one editor is the list for this entity.
  listPath: '/',

  editPath: (id) => `/achievements/${id}/edit`,
  fields: (context) => [
    { kind: 'text', name: 'achievement', label: 'Achievement', required: true },
    {
      kind: 'textarea',
      name: 'story',
      label: 'Story',
      hint: 'Interview preparation, not part of the CV document.',
    },
    {
      kind: 'select',
      name: 'jobId',
      label: 'Job',
      required: true,
      options: jobOptions(context.jobs),
      hint: 'Achievements belong to exactly one job.',
    },
  ],
  describe: (row, context) => {
    const record = as<Achievement>(row)
    return {
      heading: record.achievement,
      detail:
        jobOptions(context.jobs).find((option) => option.value === record.jobId)?.label ?? '',
    }
  },
}

function awardEducationFields(): readonly Field[] {
  return [
    {
      kind: 'year',
      name: 'year',
      label: 'Year',
      required: true,
      hint: 'The year only — awards and education are recorded by year, not by date.',
    },
    { kind: 'text', name: 'institution', label: 'Institution', required: true },
    { kind: 'text', name: 'what', label: 'What', required: true },
    {
      kind: 'textarea',
      name: 'story',
      label: 'Story',
      hint: 'Interview preparation, not part of the CV document.',
    },
  ]
}

function describeAwardEducation(record: { year: number; institution: string; what: string }) {
  return {
    heading: record.institution || '(no institution)',
    detail: `${formatYear(record.year)} - ${record.what}`,
  }
}

export const awards: EntityDefinition = {
  singular: 'Award',
  plural: 'Awards',
  table: 'awards',
  // No list route of its own; the all-in-one editor is the list for this entity.
  listPath: '/',

  editPath: (id) => `/awards/${id}/edit`,
  fields: () => awardEducationFields(),
  describe: (row) => describeAwardEducation(as<Award>(row)),
}

export const education: EntityDefinition = {
  singular: 'Education',
  plural: 'Education',
  table: 'education',
  // No list route of its own; the all-in-one editor is the list for this entity.
  listPath: '/',

  editPath: (id) => `/education/${id}/edit`,
  fields: () => awardEducationFields(),
  describe: (row) => describeAwardEducation(as<Education>(row)),
}

export const questionCategories: EntityDefinition = {
  singular: 'Question category',
  plural: 'Question categories',
  table: 'questionCategories',
  listPath: '/questions',
  newPath: '/questions/new',
  editPath: (id) => `/question-categories/${id}/edit`,
  fields: () => [
    { kind: 'text', name: 'title', label: 'Title', required: true },
    {
      kind: 'textarea',
      name: 'story',
      label: 'Story',
      hint: 'Interview preparation, not part of the CV document.',
    },
  ],
  describe: (row) => ({ heading: as<QuestionCategory>(row).title || '(untitled)', detail: '' }),
}

export const questions: EntityDefinition = {
  singular: 'Question',
  plural: 'Questions',
  table: 'questions',
  listPath: '/questions/all',
  newPath: '/questions/all/new',
  editPath: (id) => `/questions/${id}/edit`,
  fields: (context) => [
    { kind: 'textarea', name: 'question', label: 'Question', required: true, rows: 3 },
    { kind: 'textarea', name: 'answer', label: 'Answer' },
    {
      kind: 'select',
      name: 'categoryId',
      label: 'Category',
      required: true,
      options: categoryOptions(context.questionCategories),
    },
  ],
  describe: (row, context) => {
    const record = as<Question>(row)
    return {
      heading: record.question,
      detail:
        categoryOptions(context.questionCategories).find(
          (option) => option.value === record.categoryId,
        )?.label ?? '',
    }
  },
}

/** Every definition, for the generic list and form routes. */
export const REGISTRY = {
  profiles,
  jobs,
  achievements,
  awards,
  education,
  questionCategories,
  questions,
} as const

export type RegistryKey = keyof typeof REGISTRY

/** The Dexie table for a registry key, typed to that entity. */
export function tableOf<K extends RegistryKey>(key: K) {
  return db.table(REGISTRY[key].table)
}

/** A blank record for the "new" route, defaulted from the current date. */
export function blankRecord<K extends RegistryKey>(key: K, now: Date) {
  const defaults: Record<string, unknown> = {}

  if (key === 'awards' || key === 'education') {
    defaults['year'] = currentYear(now)
  }
  if (key === 'jobs') {
    defaults['startDate'] = now.toISOString().slice(0, 10)
    defaults['endDate'] = null
  }

  return { id: '', updatedAt: '', deletedAt: null, ...defaults } as Record<string, unknown>
}
