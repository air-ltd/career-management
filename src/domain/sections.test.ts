/**
 * The document's sections.
 *
 * The names and headings are what the document calls its own parts, and a
 * document can carry a section this build has never heard of — one from a
 * later build, kept rather than dropped (D6). Such a section has no name and no
 * heading here, and the one thing that must not happen is a crash: the
 * document still has to print.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTION_NAMES, headingFor, nameFor } from './sections'

describe('a section this build does not know', () => {
  it('is named by its own key, rather than nothing', () => {
    // The key is the fallback, so the section is identifiable even when there
    // is no name for it here.
    expect(nameFor('aSectionFromTheFuture', undefined)).toBe('aSectionFromTheFuture')
  })

  it('has no heading of its own, so the key stands in for it', () => {
    // There is no heading for a section this build has never heard of, and the
    // key is the only thing that can stand in for one.
    expect(headingFor('aSectionFromTheFuture', undefined)).toBe('aSectionFromTheFuture')
  })

  it('uses the heading the document gives it, when it has one', () => {
    expect(nameFor('aSectionFromTheFuture', { aSectionFromTheFuture: 'Later' })).toBe('Later')
  })
})

describe('a section this build does know', () => {
  it('is named by its own name', () => {
    expect(nameFor('workHistory', undefined)).toBe(DEFAULT_SECTION_NAMES['workHistory'])
  })

  it('is named by the heading the document gives it, when it has one', () => {
    expect(nameFor('workHistory', { workHistory: 'Experience' })).toBe('Experience')
  })

  it('is named by its own name when the heading is empty', () => {
    // An empty heading is a section with no visible title, which is what the
    // work history is — not a section with no name.
    expect(headingFor('workHistory', { workHistory: '' })).toBe('')
    expect(nameFor('workHistory', { workHistory: '' })).toBe(
      DEFAULT_SECTION_NAMES['workHistory'],
    )
  })
})
