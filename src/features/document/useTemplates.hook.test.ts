/**
 * The templates hook.
 *
 * The wiring rather than the logic: that the built-in is there, that choosing a
 * template writes its settings into the document and nothing else, and that
 * deleting one can be undone.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTemplates } from './useTemplates'
import { db } from '../../storage/db'
import { defaultSettings } from '../../export/envelope'
import { builtInTemplate, BUILT_IN_TEMPLATE_ID } from '../../domain/templates'
import type { Settings } from '../../domain/types'

const NOW = new Date('2026-10-01T00:00:00.000Z')

function setup(settings: Settings = defaultSettings(NOW)) {
  const saveSettings = vi.fn()
  const view = renderHook(() => useTemplates(settings, saveSettings, NOW))
  return { ...view, saveSettings }
}

describe('useTemplates', () => {
  it('writes the built-in template, so there is always one to choose', async () => {
    const { result } = setup()
    await waitFor(() => {
      expect(result.current.templates.length).toBeGreaterThan(0)
    })
    expect(result.current.templates[0]?.id).toBe(BUILT_IN_TEMPLATE_ID)
  })

  it('says which template the document currently matches', async () => {
    const { result } = setup()
    await waitFor(() => {
      expect(result.current.current).not.toBeNull()
    })
    expect(result.current.current?.id).toBe(BUILT_IN_TEMPLATE_ID)
  })

  it('says no template matches a document the user has changed', async () => {
    const { result } = setup({ ...defaultSettings(NOW), fontSizePt: 12 })
    await waitFor(() => {
      expect(result.current.templates.length).toBeGreaterThan(0)
    })
    expect(result.current.current).toBeNull()
  })

  it('applies a template by writing its settings, and nothing else', async () => {
    const { result, saveSettings } = setup()
    await waitFor(() => {
      expect(result.current.templates.length).toBeGreaterThan(0)
    })
    const template = result.current.templates[0]
    expect(template).toBeDefined()
    if (template === undefined) return
    act(() => {
      result.current.apply(template)
    })
    // The settings the template carries, and not the profile — a template is a
    // choice of shape, not of who the document is for (D56).
    expect(saveSettings).toHaveBeenCalledTimes(1)
    const written = saveSettings.mock.calls[0]?.[0] as Settings
    expect(written.pageSize).toBe(template?.pageSize)
    expect(written.fontSizePt).toBe(template?.fontSizePt)
    expect(written.activeProfileId).toBeNull()
  })

  it('saves the current settings as a new template, rather than changing a built-in', async () => {
    const { result } = setup({ ...defaultSettings(NOW), fontSizePt: 12 })
    await waitFor(() => {
      expect(result.current.templates.length).toBeGreaterThan(0)
    })
    act(() => {
      result.current.saveCurrentAs('  My template  ')
    })
    await waitFor(async () => {
      const rows = await db.templates.toArray()
      expect(rows.some((row) => row.name === 'My template')).toBe(true)
    })
    const rows = await db.templates.toArray()
    const saved = rows.find((row) => row.name === 'My template')
    expect(saved?.builtIn).toBe(false)
    expect(saved?.fontSizePt).toBe(12)
    // The built-in is untouched.
    expect((await db.templates.get(BUILT_IN_TEMPLATE_ID))?.fontSizePt).toBe(10)
  })

  it('saves nothing for a name that is only whitespace', async () => {
    const { result } = setup()
    await waitFor(() => {
      expect(result.current.templates.length).toBeGreaterThan(0)
    })
    act(() => {
      result.current.saveCurrentAs('   ')
    })
    const rows = await db.templates.toArray()
    expect(rows.filter((row) => row.name === '')).toHaveLength(0)
  })

  it('deletes a template, and brings it back', async () => {
    const { result } = setup()
    await waitFor(() => {
      expect(result.current.templates.length).toBeGreaterThan(0)
    })
    await db.templates.put({
      ...builtInTemplate(NOW),
      id: 'mine',
      name: 'Mine',
      builtIn: false,
    })
    const template = { ...builtInTemplate(NOW), id: 'mine', name: 'Mine', builtIn: false }
    act(() => {
      result.current.remove(template)
    })
    await waitFor(() => {
      expect(result.current.undo?.name).toBe('Mine')
    })
    expect((await db.templates.get('mine'))?.deletedAt).not.toBeNull()
    act(() => {
      result.current.restore()
    })
    await waitFor(async () => {
      expect((await db.templates.get('mine'))?.deletedAt).toBeNull()
    })
    expect(result.current.undo).toBeNull()
  })
})
