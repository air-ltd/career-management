/**
 * The application shell and routes.
 *
 * Routing is a table of five-ish patterns matched against the hash, rather than
 * path routing, because GitHub Pages performs no request rewriting (D3).
 */

import { useEffect, useMemo, useState } from 'react'
import { matchPath, usePath, type Route } from './router'
import {
  applyTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersDark,
  type ThemePreference,
} from './theme'
import { RegistryList } from '../features/shared/RegistryList'
import { RegistryEdit } from '../features/shared/RegistryEdit'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SyncPage } from '../features/sync/SyncPage'
import { SyncIndicator } from '../features/sync/SyncIndicator'
import { describeKeySource } from '../sync/appKey'
import { SyncProvider } from '../features/sync/SyncProvider'
import { DocumentIcon, SettingsIcon } from './Icons'
import { DocumentPage } from '../features/document/DocumentPage'
import { AllInOnePage } from '../features/document/AllInOnePage'
import { QuestionsPage } from '../features/document/QuestionsPage'

const ROUTES: readonly Route[] = [
  { path: '/' },
  { path: '/profiles' },
  { path: '/profiles/new' },
  { path: '/profiles/:id/edit' },
  // Jobs have no list or "new" route, for the same reason achievements, awards and
  // education have none: they are created and listed in the edit-all page, which
  // the header reaches as "Work history". The per-record edit route stays.
  { path: '/jobs/:id/edit' },
  // Achievements, awards and education have no list or "new" route. They are
  // created and edited from the all-in-one editor, which is the primary editing
  // surface (D10); a standalone list for each was a second way to do the same
  // thing. Their per-record edit routes stay, because the editor and the fit
  // report both link straight to one.
  { path: '/achievements/:id/edit' },
  { path: '/awards/:id/edit' },
  { path: '/education/:id/edit' },
  { path: '/questions' },
  { path: '/questions/new' },
  { path: '/question-categories/:id/edit' },
  { path: '/questions/all' },
  { path: '/questions/all/new' },
  { path: '/questions/:id/edit' },
  { path: '/document' },
  // The career content and the interview questions are two editing pages, split
  // because the questions are preparation rather than a record of employment,
  // and because they sat below the fold of a page long enough to need
  // scrolling. `/questions` and `/questions/all` are the list views.
  { path: '/edit' },
  { path: '/interview' },
  { path: '/settings' },
  { path: '/sync' },
]

/*
 * The header's sections.
 *
 * Only Jobs. The Profiles and Questions links went because the header was offering
 * two ways to reach something the editing pages already hold: profiles are the
 * first section of the edit-all page, and questions have a page of their own, both
 * reachable from the header's home link in one click. A nav entry that duplicates a
 * page is a second thing to keep in step with it.
 *
 * The list routes themselves stay — a direct link to one still resolves, and the
 * editor's fit report links into them.
 */
const SECTIONS = [
  { href: '/', label: 'Work history' },
  { href: '/interview', label: 'Questions' },
] as const

export function App() {
  const path = usePath()
  const match = useMemo(() => matchPath(path, ROUTES), [path])

  const [theme, setTheme] = useState<ThemePreference>(readStoredPreference)
  /**
   * The system preference is read into state rather than queried at render, so a
   * change while the app is open re-renders it. Without this, choosing "system"
   * would fix the theme at the moment it was chosen.
   */
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches)
    }
    query.addEventListener('change', onChange)
    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [])

  useEffect(() => {
    applyTheme(resolveTheme(theme, systemDark))
  }, [theme, systemDark])

  /**
   * `now` is threaded from the app rather than read inside each view, so a test
   * can assert on a defaulted date without freezing the clock globally.
   */
  const now = useMemo(() => new Date(), [])
  const { environment } = useMemo(() => describeKeySource(), [])

  function onThemeChange(next: ThemePreference) {
    storePreference(next)
    setTheme(next)
  }

  return (
    <SyncProvider>
      <div className="app">
        <header className="app-header">
          <h1>
            <a className="app-home" href="#/" aria-label="Career Management Document, home">
              <DocumentIcon size={28} />
              <span>
                Career Management Document
                {/*
                  The badge and the sync target come from one function (SY33), so
                  a dev build pointed at production Dropbox cannot disagree with
                  what the title says about it.
                */}
                {environment !== 'production' && (
                  <span className="env-badge">{environment}</span>
                )}
              </span>
            </a>
          </h1>
          <nav aria-label="Sections">
            <ul className="app-nav">
              {SECTIONS.map((section) => (
                <li key={section.href}>
                  <a
                    href={`#${section.href}`}
                    aria-current={
                      (section.href === '/' ? path === '/' : path.startsWith(section.href))
                        ? 'page'
                        : undefined
                    }
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="app-header-controls">
            <a
              className="app-nav-link"
              href="#/document"
              aria-current={path === '/document' ? 'page' : undefined}
            >
              Document
            </a>
            <SyncIndicator />
            <a
              className="button button-icon"
              href="#/settings"
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon />
            </a>
          </div>
        </header>

        <main className="app-main">
          {renderRoute(
            match?.route.path ?? null,
            match?.params ?? {},
            now,
            theme,
            onThemeChange,
          )}
        </main>
      </div>
    </SyncProvider>
  )
}

function renderRoute(
  routePath: string | null,
  params: Record<string, string>,
  now: Date,
  theme: ThemePreference,
  onThemeChange: (next: ThemePreference) => void,
) {
  if (routePath === null) {
    return (
      <section>
        <h2>Page not found</h2>
        <p>
          Nothing is routed at <code>{window.location.hash}</code>.
        </p>
        <p>
          <a href="#/">Back to the start</a>
        </p>
      </section>
    )
  }

  // A list route.
  const listKey = LIST_ROUTES[routePath]
  if (listKey) return <RegistryList registryKey={listKey} now={now} />

  // A new-record route. The id is absent, so the form starts blank.
  const newKey = NEW_ROUTES[routePath]
  if (newKey) return <RegistryEdit registryKey={newKey} id={null} now={now} />

  // An edit route, which needs an id in the path.
  const editKey = EDIT_ROUTES[routePath]
  if (editKey) {
    const id = params['id']
    if (id === undefined) {
      return (
        <p className="hint">
          No record was named. <a href="#/">Back to the start</a>.
        </p>
      )
    }
    return <RegistryEdit registryKey={editKey} id={id} now={now} />
  }

  switch (routePath) {
    case '/':
    case '/edit':
      return <AllInOnePage now={now} />
    case '/interview':
      return <QuestionsPage now={now} />
    case '/document':
      return <DocumentPage now={now} />
    case '/settings':
      return <SettingsPage now={now} theme={theme} onThemeChange={onThemeChange} />
    case '/sync':
      return <SyncPage />
    default:
      return <p className="hint">Nothing is routed at {routePath}.</p>
  }
}

const LIST_ROUTES: Record<
  string,
  Parameters<typeof RegistryList>[0]['registryKey'] | undefined
> = {
  '/profiles': 'profiles',
  '/questions': 'questionCategories',
  '/questions/all': 'questions',
}

const NEW_ROUTES: Record<
  string,
  Parameters<typeof RegistryEdit>[0]['registryKey'] | undefined
> = {
  '/profiles/new': 'profiles',
  '/questions/new': 'questionCategories',
  '/questions/all/new': 'questions',
}

const EDIT_ROUTES: Record<
  string,
  Parameters<typeof RegistryEdit>[0]['registryKey'] | undefined
> = {
  '/profiles/:id/edit': 'profiles',
  '/jobs/:id/edit': 'jobs',
  '/achievements/:id/edit': 'achievements',
  '/awards/:id/edit': 'awards',
  '/education/:id/edit': 'education',
  '/question-categories/:id/edit': 'questionCategories',
  '/questions/:id/edit': 'questions',
}
