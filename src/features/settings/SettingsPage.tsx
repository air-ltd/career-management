/**
 * Settings for the app.
 *
 * About the app and the device, not about the document. The document's own
 * settings — its template, its paper, its type, its spacing, its layout, its
 * sections and its profile — live in the rail beside the document, where the
 * consequence of a change is visible while the change is being made. A settings
 * page is the wrong place for them: it is a page you go to and remember, and
 * the paper size is something you notice while looking at the paper.
 */

import { useEffect, useState } from 'react'
import type { ThemePreference } from '../../app/theme'
import { clearProviderKey, readProviderKey, writeProviderKey } from '../../ai/key'
import { chatCompletionsProvider } from '../../ai/chatCompletions'

export interface SettingsPageProps {
  now: Date
  onThemeChange: (next: ThemePreference) => void
  theme: ThemePreference
}

export function SettingsPage({ onThemeChange, theme }: SettingsPageProps) {
  // The key is read from the secrets store, never from the document.
  const [providerKey, setProviderKey] = useState('')
  const [keySaved, setKeySaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const storedKey = await readProviderKey(chatCompletionsProvider.id)
      if (!cancelled) setProviderKey(storedKey)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="settings-page">
      <h2>Settings</h2>

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
        and nowhere else, so it is saved here and not with the document.
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
    </section>
  )
}
