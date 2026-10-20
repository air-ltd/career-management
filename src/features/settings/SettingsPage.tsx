/**
 * Document settings.
 *
 * These are properties of the document, not of the device: a CV tuned to fit one
 * A4 page has to print the same way on every machine (D28, D41). They sync, like
 * everything else.
 */

import { useEffect, useState } from 'react'
import { MAX_FONT_SIZE_PT, MIN_FONT_SIZE_PT, type Settings } from '../../domain/types'
import { readSettings, writeSettings } from '../shared/data'
import type { ThemePreference } from '../../app/theme'
import { db } from '../../storage/db'
import type { Profile } from '../../domain/types'
import { clearProviderKey, readProviderKey, writeProviderKey } from '../../ai/key'
import { chatCompletionsProvider } from '../../ai/chatCompletions'

export interface SettingsPageProps {
  now: Date
  onThemeChange: (next: ThemePreference) => void
  theme: ThemePreference
}

export function SettingsPage({ now, onThemeChange, theme }: SettingsPageProps) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  // The key is read from the secrets store, never from the document.
  const [providerKey, setProviderKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [current, allProfiles, storedKey] = await Promise.all([
        readSettings(),
        db.profiles.toArray(),
        readProviderKey(chatCompletionsProvider.id),
      ])
      if (!cancelled) setProviderKey(storedKey)
      if (cancelled) return
      setSettings(current)
      setProfiles(allProfiles.filter((profile) => profile.deletedAt === null))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (settings === null) return <p className="hint">Loading…</p>

  function update(patch: Partial<Settings>) {
    setSettings((previous) => (previous === null ? previous : { ...previous, ...patch }))
    setSaved(false)
  }

  return (
    <section className="settings-page">
      <h2>Settings</h2>

      <div className="panel">
        <h3>Document</h3>

        <div className="field">
          <label htmlFor="active-profile">Profile used in the document header</label>
          <select
            id="active-profile"
            value={settings.activeProfileId ?? ''}
            onChange={(event) => {
              update({ activeProfileId: event.target.value === '' ? null : event.target.value })
            }}
          >
            {/*
              The same rule as the picker on the document page: no way to select "no
              profile". Where several exist and none is chosen, this prompts instead.
            */}
            {profiles.length > 1 && settings.activeProfileId === null && (
              <option value="" disabled>
                Choose a profile
              </option>
            )}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name || '(unnamed)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel">
        <h3>Print</h3>

        <div className="field">
          <label htmlFor="page-size">Page size</label>
          <select
            id="page-size"
            value={settings.pageSize}
            onChange={(event) => {
              update({ pageSize: event.target.value as Settings['pageSize'] })
            }}
          >
            <option value="A4">A4</option>
            <option value="Letter">US Letter</option>
            <option value="Legal">Legal</option>
          </select>
          {/**
           * D43. Browsers default the print dialog to the printer's own paper
           * size and most people never change it, so a document set to A4 prints
           * on whatever is in the tray while the layout was computed for A4.
           * The app cannot detect or correct what the dialog does.
           */}
          <p className="field-hint">
            The print dialog has to be set to the same size. Browsers default it to the
            printer's own setting, and the layout is computed for the size chosen here.
          </p>
        </div>

        <div className="field">
          <label htmlFor="font-size">Type size: {settings.fontSizePt}pt</label>
          <input
            id="font-size"
            type="range"
            min={MIN_FONT_SIZE_PT}
            max={MAX_FONT_SIZE_PT}
            step={1}
            value={settings.fontSizePt}
            onChange={(event) => {
              update({ fontSizePt: Number(event.target.value) })
            }}
          />
          <p className="field-hint">
            Printed only. The app will not shrink text to make the document fit — it will tell
            you what to shorten instead.
          </p>
        </div>

        <div className="field">
          <label htmlFor="format">Format</label>
          <select
            id="format"
            value={settings.format ?? 'compressed'}
            onChange={(event) => {
              update({ format: event.target.value as NonNullable<Settings['format']> })
            }}
          >
            <option value="compressed">Compressed</option>
            <option value="expanded">Expanded</option>
          </select>
          <p className="field-hint">
            Expanded puts a blank line after every role. A role reduced to a single line gets
            none, because there is no content to separate. The first step towards being able to
            build your own template.
          </p>
        </div>

        <div className="field">
          <label htmlFor="density">Spacing</label>
          <select
            id="density"
            value={settings.density}
            onChange={(event) => {
              update({ density: event.target.value as Settings['density'] })
            }}
          >
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="comfortable">Comfortable</option>
          </select>
          <p className="field-hint">
            Changes spacing rather than type size, so a page can be reclaimed without making the
            text harder to read.
          </p>
        </div>
      </div>

      <div className="panel">
        <h3>Appearance</h3>
        <div className="field">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={theme}
            onChange={(event) => {
              onThemeChange(event.target.value as ThemePreference)
            }}
          >
            <option value="system">Follow the system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      {/*
        The assistant's key.

        Its own panel, and its own save, because it is not a document setting: it
        is a credential, and it must never be written into the document, which
        syncs to Dropbox and is exported to employers. It is kept in this browser
        and nowhere else, so it is saved here and not with the settings.
      */}
      <div className="panel">
        <h3>Assistant</h3>
        <p className="hint">
          Drafting a line with an assistant uses a provider of your own. Your key is kept in
          this browser only: it is never synced, never exported and never sent anywhere but the
          provider. The document itself is never sent — only the instruction and the line you
          are writing.
        </p>
        <div className="field">
          <label htmlFor="provider-key">Your provider key</label>
          <input
            id="provider-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={providerKey}
            onChange={(event) => {
              setProviderKey(event.target.value)
              setKeySaved(false)
            }}
          />
          <p className="field-hint">
            {providerKey === ''
              ? 'No key is set, so the drafting panel is not offered.'
              : `Kept in this browser. The provider is ${chatCompletionsProvider.label}, at ${chatCompletionsProvider.origin}.`}
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={() => {
              void writeProviderKey(chatCompletionsProvider.id, providerKey.trim()).then(() => {
                setKeySaved(true)
              })
            }}
          >
            Save key
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              void clearProviderKey(chatCompletionsProvider.id).then(() => {
                setProviderKey('')
                setKeySaved(true)
              })
            }}
          >
            Forget key
          </button>
          {keySaved && <span className="hint">Saved.</span>}
        </div>
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            void writeSettings(settings, now).then(() => {
              setSaved(true)
            })
          }}
        >
          Save settings
        </button>
        {saved && <span className="hint">Saved.</span>}
      </div>
    </section>
  )
}
