/**
 * Page geometry, shared by print and Word.
 *
 * In millimetres and points throughout, because that is what paper, margins and
 * Word's page setup are actually expressed in (D46). Computing in CSS pixels at
 * an assumed 96dpi is an estimate of an estimate, and mixing units is where a
 * layout silently drifts by a few percent.
 *
 * One definition, two consumers: the fit report measures against this, the print
 * stylesheet lays out on this, and the `.docx` exporter sets Word's page setup
 * from this (D44). A document tuned to fit one A4 page and exported to Word is
 * the same layout in a different file.
 */

import type { DocumentModel } from './model'

export type PageSize = DocumentModel['settings']['pageSize']

export interface PageGeometry {
  label: PageSize
  widthMm: number
  heightMm: number
  marginMm: number
  /** Content area, after margins, in points. */
  contentWidthPt: number
  contentHeightPt: number
  /** Content area, after margins, in twips. Word measures in these. */
  contentWidthTwips: number
}

/** 18mm, which is what a CV expects. */
export const MARGIN_MM = 18
/** 1 point = 1/72 inch; 1 inch = 25.4mm. */
const PT_PER_MM = 72 / 25.4

const DIMENSIONS: Record<PageSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
}

export function pageGeometry(pageSize: PageSize): PageGeometry {
  const { widthMm, heightMm } = DIMENSIONS[pageSize]
  const marginPt = MARGIN_MM * PT_PER_MM

  return {
    label: pageSize,
    widthMm,
    heightMm,
    marginMm: MARGIN_MM,
    contentWidthPt: widthMm * PT_PER_MM - marginPt * 2,
    contentHeightPt: heightMm * PT_PER_MM - marginPt * 2,
    contentWidthTwips: mmToTwip(widthMm - MARGIN_MM * 2),
  }
}

/** The `@page` rule, generated from the geometry rather than written by hand. */
export function pageRule(geometry: PageGeometry): string {
  return `@page { size: ${geometry.widthMm}mm ${geometry.heightMm}mm; margin: ${MARGIN_MM}mm; }`
}

/**
 * Millimetres to twips: inches to points to twentieths of a point, floored.
 *
 * Exactly what `docx`'s own `convertMillimetersToTwip` does. Written out here
 * rather than imported so the browser-side fit report does not pull the `.docx`
 * library into its dependency graph, and matching it exactly is what keeps the
 * measurement and the export on the same paper (D44, D46).
 */
export function mmToTwip(millimetres: number): number {
  return Math.floor((millimetres / 25.4) * 72 * 20)
}

/**
 * Word's page setup, derived from the same geometry.
 *
 * Includes the margin, which Word defaults to 1 inch. Without setting it, a
 * document exported from an 18mm layout came out with 25.4mm margins and a
 * different measure — so it fitted a different number of lines than the thing it
 * was exported from.
 */
export function wordPageSize(geometry: PageGeometry) {
  const margin = mmToTwip(geometry.marginMm)
  return {
    size: {
      width: mmToTwip(geometry.widthMm),
      height: mmToTwip(geometry.heightMm),
      orientation: 'portrait' as const,
    },
    margin: { top: margin, right: margin, bottom: margin, left: margin },
  }
}
