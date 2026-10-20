/**
 * The page rule and the geometry behind it.
 *
 * Generated from the geometry rather than written by hand, so that the paper the
 * document prints on and the box the fit report measures against cannot drift
 * apart (D46).
 */

import { describe, expect, it } from 'vitest'
import { MARGIN_MM, mmToTwip, pageGeometry, pageRule, wordPageSize } from './page'

describe('the geometry', () => {
  it('leaves the content area after the margins', () => {
    const geometry = pageGeometry('A4')
    // A4 is 210mm wide with 10.5mm on each side, so 189mm of text — which is
    // 535.75 points.
    expect(geometry.contentWidthPt).toBeCloseTo(535.75, 1)
    expect(geometry.marginMm).toBe(MARGIN_MM)
  })

  it('follows the page size it is given', () => {
    expect(pageGeometry('A4').widthMm).toBe(210)
    expect(pageGeometry('Letter').widthMm).toBe(215.9)
    expect(pageGeometry('Legal').heightMm).toBe(355.6)
  })
})

describe('the page rule', () => {
  it('names the page size and the margin, in millimetres', () => {
    const rule = pageRule(pageGeometry('A4'))
    expect(rule).toBe('@page { size: 210mm 297mm; margin: 10.5mm; }')
  })

  it('follows the page size it is given', () => {
    expect(pageRule(pageGeometry('Letter'))).toContain('215.9mm 279.4mm')
    expect(pageRule(pageGeometry('Legal'))).toContain('215.9mm 355.6mm')
  })
})

describe('millimetres in twips', () => {
  it('is the same conversion the Word exporter uses', () => {
    // Word measures in twips, and a document exported to Word has to be laid out
    // on the same paper as the one that printed.
    expect(mmToTwip(25.4)).toBe(1440)
    expect(mmToTwip(0)).toBe(0)
  })
})

describe('the Word page setup', () => {
  it('carries the margin, which Word would otherwise set to an inch', () => {
    const size = wordPageSize(pageGeometry('A4'))
    expect(size.margin.top).toBe(mmToTwip(MARGIN_MM))
    expect(size.margin.left).toBe(mmToTwip(MARGIN_MM))
    expect(size.size.orientation).toBe('portrait')
    expect(size.size.width).toBe(mmToTwip(210))
  })
})
