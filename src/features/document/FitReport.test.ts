import { describe, expect, it } from 'vitest'
import { measureFit, overLongAchievements } from './FitReport'
import { buildDocumentModel, PRESETS } from '../../export/model'
import { defaultSettings } from '../../export/envelope'
import { pageGeometry } from '../../export/page'
import type { DocumentModel } from '../../export/model'
import type { ExportOptions } from '../../export/model'
import type { Settings } from '../../domain/types'

/**
 * The achievements that run long are the ones the user is asked to rewrite, and
 * the report links each of them to its own edit page. The link is only useful
 * if it carries the achievement's id, so the id has to be read from the
 * attribute that holds it.
 *
 * `data-fit-achievement` is the marker that says "this is an achievement" and is
 * empty by design; `data-fit-achievement-id` carries the id. Reading the marker
 * instead gives an empty id, and the link becomes `#/achievements//edit`, which
 * goes nowhere.
 */
describe('the achievements that run long', () => {
  it('carries the id of the achievement, so the link reaches it', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="short-1"
          style="height: 20px; line-height: 20px"></li>
      <li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="short-2"
          style="height: 20px; line-height: 20px"></li>
      <li data-fit-achievement="" data-fit-job="job-2" data-fit-achievement-id="the-long-one"
          style="height: 60px; line-height: 20px"></li>
    `

    const overLong = overLongAchievements(container)

    expect(overLong).toHaveLength(1)
    expect(overLong[0]?.achievementId).toBe('the-long-one')
    expect(overLong[0]?.jobId).toBe('job-2')
    expect(overLong[0]?.lines).toBe(3)
  })

  it('leaves the short ones out', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="a"
          style="height: 20px; line-height: 20px"></li>
      <li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="b"
          style="height: 20px; line-height: 20px"></li>
    `

    expect(overLongAchievements(container)).toEqual([])
  })
})

/**
 * The measurement itself.
 *
 * The report is what tells the user whether what they are writing fits the
 * page, and the number it gives is a page count — so the things that decide it
 * are the height of the document against the height of the paper, the target
 * for the kind of document it is, and which records run long.
 */
describe('the measurement', () => {
  /**
   * A document as the app renders it: a marked element with a height, and the
   * achievements in it.
   *
   * The heights are inline because that is what `getComputedStyle` reads back:
   * the measurement is of the rendered document, not of a number someone typed.
   */
  function rendered(heightPx: number, achievementHeights: number[] = []): HTMLElement {
    const container = document.createElement('div')
    const rows = achievementHeights
      .map(
        (height, index) =>
          `<li data-fit-achievement="" data-fit-job="job-1" data-fit-achievement-id="a${index}" ` +
          `style="height: ${String(height)}px; line-height: 20px"></li>`,
      )
      .join('')
    container.innerHTML = `<div data-fit-document style="height: ${heightPx}px">${rows}</div>`
    return container
  }

  function modelFor(
    options: ExportOptions = PRESETS['cv'].options,
    settings: Settings = defaultSettings(new Date(0)),
  ): DocumentModel {
    return buildDocumentModel({
      options,
      settings,
      profiles: [],
      jobs: [],
      achievements: [],
      awards: [],
      education: [],
      questionCategories: [],
      questions: [],
    })
  }

  it('counts the pages the document will take', () => {
    const geometry = pageGeometry('A4')
    // A page of paper is this many points tall, and the browser measures in
    // pixels, which are a quarter bigger again.
    const onePagePx = (geometry.contentHeightPt / 0.75) * 1.0

    // A page and a half is two pages, and a page less is one.
    const one = measureFit({ element: rendered(onePagePx - 10), model: modelFor() })
    const two = measureFit({ element: rendered(onePagePx * 1.5), model: modelFor() })

    expect(one?.pages).toBe(1)
    expect(two?.pages).toBe(2)
  })

  it('is at least one page, even for an empty document', () => {
    const report = measureFit({ element: rendered(0), model: modelFor() })
    expect(report?.pages).toBe(1)
  })

  it('has no report when there is no document to measure', () => {
    const container = document.createElement('div')
    expect(measureFit({ element: container, model: modelFor() })).toBeNull()
  })

  it('has a target for a CV, and none for an interview document', () => {
    const cv = measureFit({ element: rendered(100), model: modelFor() })
    const interview = measureFit({
      element: rendered(100),
      model: modelFor(PRESETS['interview'].options),
    })

    expect(cv?.target).toBe(modelFor().settings.targetPages)
    // An interview document has no page to fit on: eight pages of questions is
    // working correctly, and a target would say it was wrong.
    expect(interview?.target).toBeNull()
  })

  it('names the records that run long, and how long the usual one is', () => {
    const report = measureFit({
      element: rendered(100, [20, 20, 60]),
      model: modelFor(),
    })

    expect(report?.typicalLines).toBe(1)
    expect(report?.overLong).toEqual([{ jobId: 'job-1', achievementId: 'a2', lines: 3 }])
  })
})
