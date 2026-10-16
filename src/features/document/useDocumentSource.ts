/**
 * The document data, loaded the way both document screens need it.
 *
 * The document page and the edit-all page both have to produce a real
 * `DocumentModel` — the edit-all page because printing from it must print the
 * document rather than the editor. Built here once so the two cannot disagree
 * about what is in the document, and so the rules that are easy to get subtly
 * different (which profile the header uses, what the page box is) live in one
 * place.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../storage/db'
import { defaultSettings } from '../../export/envelope'
import { buildDocumentModel, type ExportOptions } from '../../export/model'
import { pageGeometry, pageRule } from '../../export/page'
import { useRecords, writeSettings } from '../shared/data'

import type { DocumentModel } from '../../export/model'
import type {
  Achievement,
  Award,
  Education,
  Job,
  Profile,
  Question,
  QuestionCategory,
  Settings,
} from '../../domain/types'

export interface DocumentSource extends DocumentRecords {
  settings: Settings
  saveSettings: (next: Settings) => void
  liveProfiles: Profile[]
  loading: boolean
}

/** The records a document is built from, typed and in document order. */
export interface DocumentRecords {
  profiles: Profile[]
  jobs: Job[]
  achievements: Achievement[]
  awards: Award[]
  education: Education[]
  questionCategories: QuestionCategory[]
  questions: Question[]
}

/**
 * Every record the document can use, plus the settings.
 *
 * Read through `useRecords` rather than once on mount, so the document reflects
 * a save made elsewhere — including on the edit-all page it sits beside, where
 * that is the entire point of printing from there.
 */
export function useDocumentSource(now: Date): DocumentSource {
  const [stored, setStored] = useState<Settings | null>(null)
  const { records: profiles } = useRecords<Profile>('profiles')
  const { records: jobs } = useRecords<Job>('jobs')
  const { records: achievements } = useRecords<Achievement>('achievements')
  const { records: awards } = useRecords<Award>('awards')
  const { records: education } = useRecords<Education>('education')
  const { records: questionCategories } = useRecords<QuestionCategory>('questionCategories')
  const { records: questions } = useRecords<Question>('questions')

  useEffect(() => {
    let cancelled = false
    void db.settings.get('settings').then((row) => {
      if (!cancelled) setStored(row ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [now])

  const saveSettings = useCallback(
    (next: Settings) => {
      // Shown immediately; the write is a side effect that must not lag the click.
      setStored(next)
      void writeSettings(next, now)
    },
    [now],
  )

  /**
   * Fall back to the defaults until the stored settings have been read.
   *
   * Rendering the document against defaults for one frame is better than not
   * rendering it at all, and the stored settings win as soon as they arrive.
   */
  const settings = stored ?? defaultSettings(now)
  const liveProfiles = useMemo(
    () => profiles.filter((profile) => profile.deletedAt === null),
    [profiles],
  )

  return {
    settings,
    saveSettings,
    liveProfiles,
    loading: stored === null,
    profiles,
    jobs,
    achievements,
    awards,
    education,
    questionCategories,
    questions,
  }
}

export interface Document extends DocumentSource {
  model: DocumentModel
}

/**
 * The document, for the options given, rebuilt whenever anything changes.
 *
 * One hook rather than two on purpose. Splitting the settings state from the
 * model that reads it gives each caller their own copy, and a save then lands in
 * one while the other still holds what was read at mount — which is exactly how
 * choosing a profile ends up not changing the header.
 */
export function useDocument(options: ExportOptions, now: Date): Document {
  const source = useDocumentSource(now)
  const {
    settings,
    profiles,
    jobs,
    achievements,
    awards,
    education,
    questionCategories,
    questions,
  } = source

  const model = useMemo(
    () =>
      buildDocumentModel({
        options,
        settings,
        profiles,
        jobs,
        achievements,
        awards,
        education,
        questionCategories,
        questions,
      }),
    [
      options,
      settings,
      profiles,
      jobs,
      achievements,
      awards,
      education,
      questionCategories,
      questions,
    ],
  )

  return { ...source, model }
}

/**
 * Inject the `@page` rule for a page size.
 *
 * Injected rather than written into the stylesheet because the page size is a
 * setting and a stylesheet cannot know it. It comes from the same geometry the
 * fit report measures against, so the layout and the measurement cannot disagree
 * about what paper this is.
 */
export function usePageRule(pageSize: Settings['pageSize']): void {
  useEffect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-page-rule', '')
    style.textContent = pageRule(pageGeometry(pageSize))
    document.head.append(style)
    return () => {
      style.remove()
    }
  }, [pageSize])
}
