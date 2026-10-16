/**
 * The document screen: choose a preset, see the document, print it, export it.
 *
 * The presets are the primary control (D36, D37). The granular toggles are
 * available as deviations from the selected preset, never as the thing the user
 * has to assemble by hand (D38).
 */

import { useEffect, useMemo, useState } from 'react'
import { db } from '../../storage/db'
import { defaultSettings } from '../../export/envelope'
import {
  buildDocumentModel,
  PRESETS,
  type ExportOptions,
  type Preset,
} from '../../export/model'
import { pageGeometry, pageRule } from '../../export/page'
import { DocumentView } from './DocumentView'
import { useFitReport } from './FitReport'
import { DownloadIcon, PrintIcon } from '../../app/Icons'

import type {
  Achievement,
  Award,
  Education,
  Profile,
  Question,
  QuestionCategory,
  Settings,
} from '../../domain/types'

export function DocumentPage({ now }: { now: Date }) {
  const [options, setOptions] = useState<ExportOptions>(PRESETS['cv'].options)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [jobs, setJobs] = useState<Parameters<typeof buildDocumentModel>[0]['jobs']>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [awards, setAwards] = useState<Award[]>([])
  const [education, setEducation] = useState<Education[]>([])
  const [questionCategories, setQuestionCategories] = useState<QuestionCategory[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [
        currentSettings,
        profileRows,
        jobRows,
        achievementRows,
        awardRows,
        educationRows,
        categoryRows,
        questionRows,
      ] = await Promise.all([
        db.settings.get('settings').then((row) => row ?? defaultSettings(now)),
        db.profiles.toArray(),
        db.jobs.toArray(),
        db.achievements.toArray(),
        db.awards.toArray(),
        db.education.toArray(),
        db.questionCategories.toArray(),
        db.questions.toArray(),
      ])
      if (cancelled) return
      setSettings(currentSettings)
      setProfiles(profileRows)
      setJobs(jobRows)
      setAchievements(achievementRows)
      setAwards(awardRows)
      setEducation(educationRows)
      setQuestionCategories(categoryRows)
      setQuestions(questionRows)
    })()
    return () => {
      cancelled = true
    }
  }, [now])

  const model = useMemo(() => {
    if (settings === null) return null
    return buildDocumentModel({
      options,
      settings,
      profiles,
      jobs,
      achievements,
      awards,
      education,
      questionCategories,
      questions,
    })
  }, [
    options,
    settings,
    profiles,
    jobs,
    achievements,
    awards,
    education,
    questionCategories,
    questions,
  ])

  const { ref, report } = useFitReport(model)

  /**
   * The `@page` rule, generated from the document's own settings (D43).
   *
   * Injected rather than written into the stylesheet because the page size is a
   * setting and a stylesheet cannot know it. It comes from the same geometry
   * the fit report measures against, so the layout and the measurement cannot
   * disagree about what paper this is.
   *
   * Guarded on `settings` rather than `model` because the rule needs only the
   * page size, and `settings` is available a render earlier.
   */
  const pageSize = settings?.pageSize ?? 'A4'
  useEffect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-page-rule', '')
    style.textContent = pageRule(pageGeometry(pageSize))
    document.head.append(style)
    return () => {
      style.remove()
    }
  }, [pageSize])

  if (model === null || settings === null) return <p className="hint">Loading…</p>

  /**
   * A non-null alias, so the closures below can use it.
   *
   * TypeScript will not narrow a captured variable inside a function declared
   * after an early return, even a `const` one, because it cannot prove when the
   * function is called. Naming the narrowed value makes the guarantee explicit
   * rather than relying on an analysis the compiler declines to do.
   */
  const doc = model

  function selectPreset(preset: Preset) {
    setOptions(PRESETS[preset].options)
  }

  async function exportDocx() {
    setExporting(true)
    try {
      // Loaded on demand. `docx` is by far the largest dependency in the project
      // and is only needed the moment someone exports; bundling it eagerly made
      // the initial page weight roughly double for a feature most sessions never
      // touch.
      const { docxExporter } = await import('../../export/exporters/docx')
      const blob = await docxExporter.build(doc)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'career-management-document.docx'
      anchor.click()
      // Revoked on the next tick so the download has begun.
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 0)
    } finally {
      setExporting(false)
    }
  }

  const over = report !== null && report.target !== null && report.pages > report.target

  return (
    <section className="document-page">
      <div className="document-toolbar">
        <div className="document-presets" role="group" aria-label="Document">
          {(Object.keys(PRESETS) as Preset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className={options.preset === preset ? 'button button-primary' : 'button'}
              aria-pressed={options.preset === preset}
              onClick={() => {
                selectPreset(preset)
              }}
            >
              {PRESETS[preset].label}
            </button>
          ))}
        </div>

        <div className="button-row">
          {/* D22: print is the browser's job, not a generated file. */}
          <button type="button" className="button" onClick={() => window.print()}>
            <PrintIcon />
            Print / save as PDF
          </button>
          <button
            type="button"
            className="button"
            disabled={exporting}
            onClick={() => {
              void exportDocx()
            }}
          >
            <DownloadIcon />
            Word
          </button>
        </div>
      </div>

      <p className="hint">{PRESETS[options.preset].hint}</p>

      {/*
        D38: deviations from the selected preset. Presented as "also include",
        which is what they are — not as the primary control.
      */}
      <details className="document-options">
        <summary>Also include</summary>
        <label>
          <input
            type="checkbox"
            checked={options.includeStories}
            onChange={(event) => {
              setOptions((previous) => ({ ...previous, includeStories: event.target.checked }))
            }}
          />
          Stories
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.includeQuestions}
            onChange={(event) => {
              setOptions((previous) => ({
                ...previous,
                includeQuestions: event.target.checked,
              }))
            }}
          />
          Interview questions
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.includeDeleted}
            onChange={(event) => {
              setOptions((previous) => ({ ...previous, includeDeleted: event.target.checked }))
            }}
          />
          Deleted records
        </label>
      </details>

      {/*
        D32. For the CV preset only: an estimated page count against the target,
        and the specific records to shorten. Never an auto-fit, and never a
        warning on interview preparation (D40).
      */}
      {report !== null && (
        <div className={over ? 'fit-report fit-over' : 'fit-report'} role="status">
          <p>
            Estimated {report.pages} {report.pages === 1 ? 'page' : 'pages'}
            {report.target !== null && (
              <>
                {' '}
                (target {report.target}) — <em>an estimate</em>
              </>
            )}
          </p>

          {report.target !== null && (
            <p className="fit-hint">
              {over
                ? 'The app will not shrink the text to make this fit. Shorten the records below.'
                : 'Nothing to shorten. If it prints over a page, it will say so here.'}
            </p>
          )}

          {report.overLong.length > 0 && (
            <div className="fit-records">
              <p>
                These will run to {report.overLong[0]?.lines} lines when most are{' '}
                {report.typicalLines}:
              </p>
              <ul>
                {report.overLong.map((record) => (
                  <li key={record.achievementId}>
                    <a href={`#/achievements/${record.achievementId}/edit`}>
                      {jobName(model, record.jobId)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="document-paper" ref={ref}>
        <DocumentView model={model} />
      </div>
    </section>
  )
}

function jobName(model: { jobs: { id: string; company: string }[] }, jobId: string): string {
  return model.jobs.find((job) => job.id === jobId)?.company ?? 'a job'
}
