/**
 * Entity shapes for the career management document.
 *
 * Every synced entity carries the same three fields — `id`, `updatedAt` and
 * `deletedAt` — because that is what makes whole-record last-write-wins merge
 * possible. See specs/0001-plan.md section 6.4.
 *
 * The TypeScript types are derived from the Zod schema rather than declared
 * alongside it, so there is exactly one definition of each record and the
 * compiler catches drift instead of the merge engine discovering it.
 */

import { z } from 'zod'

/** An ISO-8601 instant. Refined rather than trusted: a stored timestamp is data. */
const isoInstant = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'must be an ISO instant',
})

/** `YYYY-MM-DD`, validated by round-tripping so `2024-02-31` cannot pass. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return false
    // `toISOString` on a Date built from a date-only string is UTC-stable, so a
    // real date round-trips and an impossible one does not.
    return parsed.toISOString().slice(0, 10) === value
  }, 'must be a real calendar date')

const base = {
  id: z.string().min(1),
  updatedAt: isoInstant,
  deletedAt: isoInstant.nullable(),
}

/**
 * Contact details for one presentation of the document.
 *
 * Named freely by the user (D18) — the legacy app seeded only `domestic` and
 * offered no way to create another, so `editHeader` returned the string
 * "not defined".
 */
export const profileSchema = z.looseObject({
  ...base,
  name: z.string(),
  title: z.string(),
  email: z.string(),
  address: z.string(),
  phone: z.string(),
})

/**
 * A role, with a date range. `endDate: null` means "present".
 *
 * Full date precision is stored (D17) even though the document displays month
 * and year, so nothing is lost on the way in from the legacy database.
 */
export const jobSchema = z.looseObject({
  ...base,
  startDate: isoDate,
  endDate: isoDate.nullable(),
  company: z.string(),
  jobTitle: z.string(),
  responsibilities: z.string(),
  story: z.string(),
  /**
   * Whether this role appears in the document with its detail, or as a line on its own.
   *
   * For a job the user still wants remembered — a one-line role in a career that runs
   * over several pages — without the responsibilities and achievements that push it
   * over. The header still prints, so the CV stays complete; the body is what goes.
   *
   * Optional, and so is the answer for a record written before this existed: false,
   * which is what those records already looked like.
   */
  hideDetail: z.boolean().optional(),
})

/** An achievement hanging off exactly one job. */
export const achievementSchema = z.looseObject({
  ...base,
  jobId: z.string().min(1),
  achievement: z.string(),
  story: z.string(),
  /**
   * Where this achievement sits among the ones belonging to the same job.
   *
   * Lower comes first. The order is scoped to the parent rather than the table,
   * because the same numbers mean different things under different jobs — so the
   * value is only ever compared with siblings.
   *
   * Optional, and the absence is meaningful rather than merely cautious: a record
   * written before this existed has no order, and it is sorted as if it were last.
   * Making it required would reject those rows, and a rejected achievement is not a
   * row that is ignored — it is a row the document cannot show at all.
   */
  order: z.number().optional(),
})

/**
 * Awards and education are separate entities in storage and separate forms in
 * the editor, but the document renders them as one combined table sorted by year
 * (D16).
 */
const yearOnly = z.number().int().min(1900).max(2200)

const awardEducationBase = {
  ...base,
  year: yearOnly,
  institution: z.string(),
  what: z.string(),
  story: z.string(),
}

export const awardSchema = z.looseObject(awardEducationBase)

export const educationSchema = z.looseObject(awardEducationBase)

/**
 * A question category — the "what am I working on" grouping.
 *
 * In the legacy schema this was a `jobs` row with `questions = 1`, which meant
 * every question category carried a company, a job title and two date columns it
 * could never use (D19).
 */
export const questionCategorySchema = z.looseObject({
  ...base,
  title: z.string(),
  story: z.string(),
})

/** A prepared question and its answer, belonging to exactly one category (D20). */
export const questionSchema = z.looseObject({
  ...base,
  categoryId: z.string().min(1),
  question: z.string(),
  answer: z.string(),
  /**
   * Where this question sits among the ones belonging to the same category.
   *
   * Lower comes first, and the order is scoped to the parent — the same number
   * means different things under different categories, so it is only ever
   * compared with siblings.
   *
   * Optional, and the absence is meaningful rather than merely cautious: a
   * question written before this existed has no order, and it is sorted as if it
   * were last. Making it required would reject those rows, and a rejected
   * question is not a row that is ignored — it is a row the document cannot show
   * at all.
   */
  order: z.number().optional(),
})

/** Below this the app refuses to comply rather than print something illegible. */
export const MIN_FONT_SIZE_PT = 8
/** Above this the CV stops being a CV. */
export const MAX_FONT_SIZE_PT = 14
export const DEFAULT_FONT_SIZE_PT = 10
export const DEFAULT_PAGE_SIZE = 'A4'
export const DEFAULT_TARGET_PAGES = 1

/**
 * Document-wide settings.
 *
 * Singleton, and stored as an ordinary entity so it participates in merge like
 * everything else. `activeProfileId` selects which contact details the document
 * header uses (D18).
 *
 * The print settings live here rather than in a separate table because they are a
 * property of the document: a CV tuned to fit one A4 page must print the same way
 * on every device (D28, D41).
 */
/**
 * A template: a named set of document settings (D54–D59).
 *
 * Every field is required. A template is a complete set of settings, and a
 * partial one is worse than none: it would be merged into whatever the document
 * happened to be set to at the time, which is a document nobody chose (D55).
 * `looseObject` still, so that a template written by a later build is carried
 * intact by an older one (D6) — the requirement is that the fields this build
 * knows about are all there, not that there are no others.
 *
 * There is no field for a stylesheet, and there never will be (D58): a template
 * is synced through a mechanism with no authentication, and a template that could
 * carry CSS could restyle the app as well as the document.
 */
export const templateSchema = z.looseObject({
  ...base,
  /** The name the user knows it by. */
  name: z.string().min(1),
  /**
   * Whether this is one of the app's own templates.
   *
   * A built-in cannot be edited or deleted (D61, D62): it is the template the
   * document reproduces today, and a built-in that changed silently would make
   * "the same template" mean different things on two devices.
   */
  builtIn: z.boolean(),
  pageSize: z.enum(['A4', 'Letter', 'Legal']),
  fontSizePt: z.number().min(MIN_FONT_SIZE_PT).max(MAX_FONT_SIZE_PT),
  density: z.enum(['compact', 'normal', 'comfortable']),
  format: z.enum(['compressed', 'expanded']),
  targetPages: z.number().int().min(1).max(10),
  /** Every section, in the order they are to appear. */
  sectionOrder: z.array(z.string()),
  /** The sections that are to appear at all. */
  sections: z.array(z.string()),
  /** The heading text for each section, by section key. */
  sectionHeadings: z.record(z.string(), z.string()),
})

/**
 * A phrase: something worth saying, written down once.
 *
 * The writing-support material (Phase 9). The fit report says an achievement
 * will run to four lines; what the user does next is look at an example of a
 * good one, and this is where the examples live.
 *
 * A synced entity rather than text shipped with the app: a house style is the
 * user's, not the app's, and it has to follow them between devices like
 * everything else they write.
 */
export const phraseSchema = z.looseObject({
  ...base,
  /** The text itself. What gets inserted. */
  text: z.string(),
  /**
   * When to use it, and why.
   *
   * Free text rather than a taxonomy: the user is the only one who knows what
   * their phrases are for, and a category they have to learn is a worse answer
   * than a sentence.
   */
  note: z.string(),
})

export const settingsSchema = z.looseObject({
  ...base,
  activeProfileId: z.string().nullable(),

  /** A4 default (D41). US Letter and Legal are the other supported sizes (D42). */
  pageSize: z.enum(['A4', 'Letter', 'Legal']),

  /** Print type scale in points. Never auto-fitted; there is a floor (D27, D30). */
  fontSizePt: z.number().min(MIN_FONT_SIZE_PT).max(MAX_FONT_SIZE_PT),

  /** Vertical spacing, separate from type size so a page can be reclaimed
   *  without making the text harder to read (D29). */
  density: z.enum(['compact', 'normal', 'comfortable']),

  /** Page target for the CV preset. Interview preparation has none (D35, D40). */
  targetPages: z.number().int().min(1).max(10),

  /**
   * How the document is laid out: compressed, or expanded.
   *
   * Optional because a document written before this existed has no value for it, and
   * it must keep parsing — an absent value means compressed, which is what those
   * documents already looked like. Making it required would refuse every document
   * anyone already has.
   *
   * `density` is the other half of this and a different axis: density is how tight
   * the type is set, this is whether a role is given room to breathe when it has
   * achievements to show. The first step towards letting a user build their own
   * template, which is why it is a document property rather than a view setting.
   */
  format: z.enum(['compressed', 'expanded']).optional(),

  /**
   * The order the document's sections appear in, and which of them appear.
   *
   * Optional, and the absence is what every document written before templates
   * had: the default order, and every section. Making them required would refuse
   * every document anyone already has, for a setting that decides nothing until
   * it is changed.
   */
  sectionOrder: z.array(z.string()).optional(),
  sections: z.array(z.string()).optional(),

  /**
   * The heading each section prints, by section key.
   *
   * Optional for the same reason. A section with no entry keeps its default
   * heading; a section with an empty one prints no title, which is what the work
   * history does today.
   */
  sectionHeadings: z.record(z.string(), z.string()).optional(),
})

export type Profile = z.infer<typeof profileSchema>
export type Job = z.infer<typeof jobSchema>
export type Achievement = z.infer<typeof achievementSchema>
export type Award = z.infer<typeof awardSchema>
export type Education = z.infer<typeof educationSchema>
export type QuestionCategory = z.infer<typeof questionCategorySchema>
export type Question = z.infer<typeof questionSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Template = z.infer<typeof templateSchema>
export type Phrase = z.infer<typeof phraseSchema>
export type PageSize = Settings['pageSize']
export type Density = Settings['density']

/** Anything that participates in sync, whatever its type. */
export interface Mergeable {
  id: string
  updatedAt: string
  deletedAt: string | null
}

/** The eight entity tables, by the name they carry in the envelope. */
export const ENTITY_TABLES = [
  'settings',
  'profiles',
  'jobs',
  'achievements',
  'awards',
  'education',
  'questionCategories',
  'questions',
  'templates',
  'phrases',
] as const

export type EntityTableName = (typeof ENTITY_TABLES)[number]

/** The schema that lives inside the envelope, per table. */
export const ENTITY_SCHEMAS = {
  settings: settingsSchema,
  profiles: profileSchema,
  jobs: jobSchema,
  achievements: achievementSchema,
  awards: awardSchema,
  education: educationSchema,
  questionCategories: questionCategorySchema,
  questions: questionSchema,
  templates: templateSchema,
  phrases: phraseSchema,
} as const satisfies Record<EntityTableName, z.ZodType>

/**
 * The whole document as the merge engine sees it: tables of records, no wrapper.
 *
 * The envelope in `src/export/envelope.ts` is the serialised form of one of
 * these; keeping them distinct means the merge function never has to know about
 * file formats.
 */
export type Snapshot = {
  schemaVersion: number
  entities: Record<EntityTableName, Mergeable[]>
}
