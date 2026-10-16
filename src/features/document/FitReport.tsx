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

import { useEffect, useRef, useState } from 'react'
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
  const style = window.getComputedStyle(element)

  // The content box, in points. `padding` is included so the measurement matches
  // what the printed page will actually show.
  const heightPt = cssLengthToNumber(style.height) * 0.75

  const pages = Math.max(1, Math.ceil(heightPt / geometry.contentHeightPt))

  return {
    pages,
    target: model.options.preset === 'cv' ? model.settings.targetPages : null,
    overLong: overLongAchievements(element),
    typicalLines: typicalAchievementLines(element),
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
  return Math.max(1, Math.round(element.getBoundingClientRect().height / lineHeight))
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
function overLongAchievements(container: HTMLElement) {
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
        achievementId: element.dataset['fitAchievement'] ?? '',
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
 */
export function useFitReport(model: DocumentModel | null): {
  ref: React.RefObject<HTMLDivElement | null>
  report: FitReport | null
} {
  const ref = useRef<HTMLDivElement | null>(null)
  const [report, setReport] = useState<FitReport | null>(null)

  useEffect(() => {
    const element = ref.current
    if (element === null || model === null) {
      setReport(null)
      return
    }

    const update = () => {
      setReport(measureFit({ element, model }))
    }
    update()

    // The viewport is not the page, so a resize changes what the measurement
    // means. Re-measuring keeps the report honest without a manual refresh.
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [model])

  return { ref, report }
}
