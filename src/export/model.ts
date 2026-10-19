/**
 * The resolved document: one interpretation of the data, for every consumer.
 *
 * D24: no exporter and no view may re-derive what the document contains. A PDF,
 * a `.docx` and a browser view of the same settings must be the same document,
 * or the formats drift apart quietly and the user cannot tell which one they
 * are looking at.
 *
 * The two presets (D36, D37) are the primary control. The granular toggles exist
 * for deviations from them and are always presented as deviations.
 */

import type {
  Achievement,
  Award,
  Education,
  Job,
  Profile,
  Question,
  QuestionCategory,
  Settings,
} from '../domain/types'

export type Preset = 'cv' | 'interview'

export interface ExportOptions {
  preset: Preset
  includeStories: boolean
  includeQuestions: boolean
  includeDeleted: boolean
}

/**
 * The heading for the combined awards and education table.
 *
 * Defined once because it appears in three places — the printed document, the
 * Word export, and the section's accessible name — and because the first spelling
 * used a lower-case "education" in a heading. A heading with one word in lower
 * case reads as a typo even when it is a style choice, so it is the capitalised
 * spelling here and the two other copies cannot forget.
 */
export const AWARDS_SECTION_TITLE = 'Awards and Education'

export const PRESETS: Record<Preset, { label: string; hint: string; options: ExportOptions }> =
  {
    cv: {
      label: 'CV',
      hint: 'What is sent to an employer. No stories, no interview questions.',
      options: {
        preset: 'cv',
        includeStories: false,
        includeQuestions: false,
        includeDeleted: false,
      },
    },
    interview: {
      label: 'Interview preparation',
      hint: 'Everything, including stories and prepared answers. No page target.',
      options: {
        preset: 'interview',
        includeStories: true,
        includeQuestions: true,
        includeDeleted: false,
      },
    },
  }

/** The combined awards and education table, sorted by year then institution (D16). */
export interface AwardEducationEntry {
  kind: 'award' | 'education'
  year: number
  institution: string
  what: string
  story: string
  /**
   * Carried through so the view can mark it. The rows are flattened into a
   * combined table, and without this a tombstone that had been included on
   * purpose looked exactly like a live record.
   */
  deletedAt: string | null
}

export interface QuestionCategoryGroup {
  category: QuestionCategory
  questions: Question[]
}

/**
 * Everything the document needs, already filtered and ordered.
 *
 * Sorted once here rather than in each consumer, so the on-screen document and
 * the exported one cannot disagree about what comes first.
 */
export interface DocumentModel {
  options: ExportOptions
  /** Null when no profile is selected, which is a state the user can be in. */
  profile: Profile | null
  jobs: Job[]
  achievementsByJob: Map<string, Achievement[]>
  awardsEducation: AwardEducationEntry[]
  questionCategories: QuestionCategoryGroup[]
  settings: Settings
}

/**
 * Build the document model.
 *
 * Tombstones (deleted records) are only ever included when asked. D51 keeps
 * them forever because they stop an offline device resurrecting a deletion —
 * which is a different question from whether they belong on a printed page.
 */
export function buildDocumentModel(input: {
  options: ExportOptions
  settings: Settings
  profiles: Profile[]
  jobs: Job[]
  achievements: Achievement[]
  awards: Award[]
  education: Education[]
  questionCategories: QuestionCategory[]
  questions: Question[]
}): DocumentModel {
  const { options } = input

  /**
   * The profile the document header uses.
   *
   * The selected one, or — when nothing is selected and there is exactly one
   * profile — that one. Without the fallback, adding your first profile leaves
   * the document header empty and tells you to go and select it, which is a poor
   * first run for the one action a new user takes first.
   *
   * It stops at one on purpose. With two or more and no selection there is no
   * defensible default, so the header stays empty and says so rather than picking
   * whichever the user did not mean.
   */
  const liveProfiles = input.profiles.filter((candidate) => candidate.deletedAt === null)
  const selected = liveProfiles.find(
    (candidate) => candidate.id === input.settings.activeProfileId,
  )
  const profile = selected ?? (liveProfiles.length === 1 ? liveProfiles[0] : undefined) ?? null

  const keepLive = (record: { deletedAt: string | null }): boolean =>
    record.deletedAt === null || options.includeDeleted === true

  // Jobs: newest start first, which is the ordering the legacy document used and
  // the one a CV reader expects.
  const jobs = input.jobs.filter(keepLive).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))

  /**
   * An achievement belongs to exactly one job (D9), so a job that is not in the
   * document means the achievement cannot be displayed anywhere. Dropping it here
   * — rather than leaving it in a map keyed by a job that is not there — is the
   * difference between "not shown" and "silently lost".
   */
  const jobIds = new Set(jobs.map((job) => job.id))

  const achievementsByJob = new Map<string, Achievement[]>()
  for (const achievement of input.achievements.filter(keepLive)) {
    if (!jobIds.has(achievement.jobId)) continue
    const list = achievementsByJob.get(achievement.jobId) ?? []
    list.push(achievement)
    achievementsByJob.set(achievement.jobId, list)
  }
  // Achievements within a job, oldest update first so a later edit appears where
  // the user put it rather than at the front.
  for (const list of achievementsByJob.values()) {
    list.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1))
  }

  // Awards and education are two entities in storage and one table in the document
  // (D16). Combined here so no consumer has to remember to combine them.
  const awardsEducation: AwardEducationEntry[] = [
    ...input.awards.filter(keepLive).map((award) => ({
      kind: 'award' as const,
      year: award.year,
      institution: award.institution,
      what: award.what,
      story: award.story,
      deletedAt: award.deletedAt,
    })),
    ...input.education.filter(keepLive).map((entry) => ({
      kind: 'education' as const,
      year: entry.year,
      institution: entry.institution,
      what: entry.what,
      story: entry.story,
      deletedAt: entry.deletedAt,
    })),
  ].sort((a, b) =>
    a.year === b.year ? (a.institution < b.institution ? -1 : 1) : b.year - a.year,
  )

  const questionCategories: QuestionCategoryGroup[] = options.includeQuestions
    ? input.questionCategories
        .filter(keepLive)
        .map((category) => ({
          category,
          questions: input.questions
            .filter((question) => question.categoryId === category.id && keepLive(question))
            .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1)),
        }))
        .filter((group) => group.questions.length > 0)
        /*
         * Alphabetically, not in whatever order storage returned them.
         *
         * A category is a heading rather than an event: "Behavioural", "Situational",
         * "Technical" have no chronology, so the order they come out in is an
         * accident of when they were created. Reading them A to Z is the ordering a
         * reader expects and the one that stays the same when a category is added in
         * the middle.
         *
         * The questions *within* a category stay newest-first — those do have a
         * chronology, and a question worked through recently is the one to re-read.
         */
        .sort((a, b) => a.category.title.localeCompare(b.category.title))
    : []

  return {
    options,
    profile,
    jobs,
    achievementsByJob,
    awardsEducation,
    questionCategories,
    settings: input.settings,
  }
}
