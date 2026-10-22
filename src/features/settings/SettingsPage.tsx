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

import type { ThemePreference } from '../../app/theme'
import { ASSISTANT_ENABLED } from '../../ai/enabled'
import { AssistantKey } from './AssistantKey'

export interface SettingsPageProps {
  now: Date
  onThemeChange: (next: ThemePreference) => void
  theme: ThemePreference
}

export function SettingsPage({ onThemeChange, theme }: SettingsPageProps) {
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

      {ASSISTANT_ENABLED && <AssistantKey />}
    </section>
  )
}
