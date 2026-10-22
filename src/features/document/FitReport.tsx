/**
 * The fit report (D32, D40, D45, D47).
 *
 * What this is *not* is an auto-fitter. It measures and reports, and never
 * shrinks anything to make a document fit (D27). The user rewrites the four
 * achievements that are too long; the app tells them which four.
 *
 * The page count is measured in the DOM and is labelled an estimate, because
 * browsers expose no paginated-layout API (D47). Being wrong by a line is a far
 * smaller failure than a confident wrong number.
 */

import { useEffect, useState } from 'react'
import type { DocumentModel } from '../../export/model'
import { pageGeometry } from '../../export/page'

export interface FitReport {
  /** Estimated pages, rounded up. An estimate, not a promise (D47). */
  pages: number
  /** The target for this preset. Interview preparation has none (D40). */
  target: number | null
  /** Achievements that will wrap to noticeably more lines than the norm. */
  overLong: { jobId: string; achievementId: string; lines: number }[]
  /** How many lines a typical achievement occupies here. */
  typicalLines: number
}

/** The element to measure, and the settings it is laid out at. */
export interface FitInput {
  element: HTMLElement | null
  model: DocumentModel
}

/**
 * Measure the rendered document.
 *
 * The element is measured as rendered: a container the width of the page content
 * area, at the document's type size and density. Converting between pixels and
 * points is exact at the browser's 96dpi assumption, which is why the layout
 * width is set in points rather than left to the viewport.
 */
export function measureFit({ element, model }: FitInput): FitReport | null {
  if (element === null) return null

  const geometry = pageGeometry(model.settings.pageSize)

  /*
   * The document, not the box it is in.
   *
   * The box carries the padding and the border that only exist on screen — the
   * paper around the document — and the height that matters is the height that
   * prints. Measuring the box counted that paper as content, and it was fifty
   * pixels: two and a half lines of a document that prints on one page, and
   * enough to report two.
   *
   * The document is found by the marker on it rather than by its class, which is
   * the same way the achievements are found.
   */
  const document = element.querySelector<HTMLElement>('[data-fit-document]')
  // No fallback: the box around the document is not the document, and measuring
  // it would count the paper around the text as content. With no document there
  // is nothing to measure, and no report is better than a wrong one.
  if (document === null) return null

  /*
   * The height, as it will print.
   *
   * The screen is airier than the paper, so the screen's height is not the
   * paper's height, and a page count taken from it would be wrong in the one
   * direction that matters — reporting two pages for a document that prints on
   * one.
   *
   * So the print's leading is put on the document for the length of one
   * measurement and taken off again. The height is read straight after, which
   * forces the layout to settle first, so the number is the settled one.
   */
  document.setAttribute('data-fit-printing', '')
  const style = window.getComputedStyle(document)
  const heightPt = cssLengthToNumber(style.height) * 0.75
  document.removeAttribute('data-fit-printing')
  const pages = Math.max(1, Math.ceil(heightPt / geometry.contentHeightPt))

  return {
    pages,
    /*
     * The target, for a CV.
     *
     * A CV has a page to fit on; an interview-preparation document has not, and
     * one that runs to eight pages is working correctly (D40). Which of the two
     * this is, is decided by what is in it: the questions are what make it the
     * interview document, and the questions are in the content card.
     */
    target: model.options.includeQuestions ? null : model.settings.targetPages,
    overLong: overLongAchievements(document),
    typicalLines: typicalAchievementLines(document),
  }
}

/** The numeric part of a CSS length such as "595.28px". Zero when absent. */
function cssLengthToNumber(value: string): number {
  const match = /^[+-]?[\d.]+/.exec(value)
  return match === null ? 0 : Number(match[0])
}

/** The line count of a rendered element, from its height and line-height. */
function linesOf(element: HTMLElement): number {
  const style = window.getComputedStyle(element)
  const lineHeight = cssLengthToNumber(style.lineHeight)
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 1
  /*
   * The computed height, not the rendered one.
   *
   * The card is shown larger than it prints, and the browser reports the two
   * differently: the computed height is the document's own, the rendered one is
   * the scaled-up box on the screen. Dividing the rendered height by the
   * computed line height would count a quarter more lines than the achievement
   * has — and it would say so about every achievement in the document.
   */
  const height = cssLengthToNumber(style.height)
  return Math.max(1, Math.round(height / lineHeight))
}

/**
 * Which achievements run long.
 *
 * Compared against the document's own median rather than an absolute number,
 * because what counts as long depends on the text the user has written. An
 * achievement at three times the median is a writing problem worth naming; an
 * achievement at a fixed character count is a number the user will learn to
 * ignore.
 */
export function overLongAchievements(container: HTMLElement) {
  const achievements = Array.from(
    container.querySelectorAll<HTMLElement>('[data-fit-achievement]'),
  )
  if (achievements.length === 0) return []

  const counts = achievements.map(linesOf).sort((a, b) => a - b)
  const median = counts[Math.floor(counts.length / 2)] ?? 1

  const overLong: { jobId: string; achievementId: string; lines: number }[] = []
  for (const element of achievements) {
    const lines = linesOf(element)
    if (lines >= median * 2 && lines >= 2) {
      overLong.push({
        jobId: element.dataset['fitJob'] ?? '',
        // The id, from the attribute that carries it. `data-fit-achievement` is the
        // marker that says "this is an achievement" and is empty; the id is on
        // `data-fit-achievement-id`.
        achievementId: element.dataset['fitAchievementId'] ?? '',
        lines,
      })
    }
  }
  return overLong
}

/** The median line count, which is what "normal" means for this document. */
function typicalAchievementLines(container: HTMLElement): number {
  const achievements = Array.from(
    container.querySelectorAll<HTMLElement>('[data-fit-achievement]'),
  )
  if (achievements.length === 0) return 1
  const counts = achievements.map(linesOf).sort((a, b) => a - b)
  return counts[Math.floor(counts.length / 2)] ?? 1
}

/**
 * The measurement, plus the ref to attach to the element being measured.
 *
 * Returned together because a caller needs both: the ref to put on the document
 * container, and the report to display. Separate functions would let the two
 * drift, and the report is only meaningful for the element the ref is on.
 *
 * The ref is a callback rather than an object, and that is the whole point of
 * it. The element being measured is not always in the page: the editing pages
 * render it only once they have loaded, and a ref object is read once, at the
 * moment the effect runs, which is too early. A callback ref is called when the
 * element attaches, so the measurement happens when there is something to
 * measure — which is the only time it can be right.
 */
export function useFitReport(model: DocumentModel | null): {
  ref: (element: HTMLDivElement | null) => void
  report: FitReport | null
} {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [report, setReport] = useState<FitReport | null>(null)

  useEffect(() => {
    if (element === null || model === null) return

    /*
     * The measurement is the observer's callback, and the observer's first
     * callback is the measurement.
     *
     * It reads the rendered document, which is a thing outside React, and a
     * thing that is not in the page until it is laid out. Setting the report
     * from inside the callback rather than from the body of the effect means
     * the measurement happens when there is a rendered document to measure —
     * which is the only time the number means anything — and it means the
     * effect does not set state on the way in.
     *
     * The viewport is not the page, so a resize changes what the measurement
     * means. Re-measuring keeps the report honest without a manual refresh.
     */
    const observer = new ResizeObserver(() => {
      setReport(measureFit({ element, model }))
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [element, model])

  return { ref: setElement, report }
}
