/**
 * The application shell and routes.
 *
 * Routing is a table of five-ish patterns matched against the hash, rather than
 * path routing, because GitHub Pages performs no request rewriting (D3).
 */

import { useEffect, useMemo, useState } from 'react'
import { matchPath, useLocation, type Route } from './router'
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
import { REGISTRY } from '../features/shared/registry'
import { SettingsPage } from '../features/settings/SettingsPage'
import { SyncPage } from '../features/sync/SyncPage'
import { SyncIndicator } from '../features/sync/SyncIndicator'
import { describeKeySource } from '../sync/appKey'
import { PRESETS, type ExportOptions } from '../export/model'
import { SyncProvider } from '../features/sync/SyncProvider'
import { DocumentIcon, SettingsIcon } from './Icons'
import { DocumentPage } from '../features/document/DocumentPage'
import { AboutPage } from './AboutPage'
import { AllInOnePage } from '../features/document/AllInOnePage'
import { QuestionsPage } from '../features/document/QuestionsPage'

const ROUTES: readonly Route[] = [
  { path: '/' },
  { path: '/profiles' },
  { path: '/profiles/new' },
  { path: '/profiles/:id/edit' },
  // Jobs, achievements, awards and education have no list route: they are listed
  // in the edit-all page, which the header reaches as "Work history", and a
  // standalone list for each was a second way to do the same thing. They do have
  // a "new" route and an edit route, because a record is added and edited on a
  // page of its own (D63) rather than by expanding the page under it.
  { path: '/jobs/new' },
  { path: '/jobs/:id/edit' },
  { path: '/achievements/new' },
  { path: '/achievements/:id/edit' },
  { path: '/awards/new' },
  { path: '/awards/:id/edit' },
  { path: '/education/new' },
  { path: '/education/:id/edit' },
  { path: '/phrases/new' },
  { path: '/phrases/:id/edit' },
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
  { path: '/about' },
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
  const { path, query } = useLocation()
  const match = useMemo(() => matchPath(path, ROUTES), [path])

  /*
   * Where the user was before this page, so a form can send them back to it.
   *
   * A form is opened from a list and belongs to send the user back to the list
   * they came from — the career page for a job, the questions page for a
   * question — and not to whichever list happens to hold that kind of record.
   * The previous path is held here rather than in the URL, so the link to a form
   * stays a link to a form.
   *
   * State rather than a ref, and adjusted while rendering: React's pattern for
   * deriving a value from a prop that changed. A ref would do it too, but a ref
   * read during render is the one thing React cannot tell is a value.
   *
   * On a deep link there is no previous path, and the form falls back to the
   * record's own list.
   */
  const [where, setWhere] = useState({ path, from: null as string | null })
  if (where.path !== path) {
    setWhere({ path, from: where.path })
  }
  const from = where.from

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

  /*
   * The document options, held here rather than in either editing page.
   *
   * A record is edited on a page of its own now, and coming back to the editor
   * has to arrive with the same choices — a story that stopped being shown
   * because the user opened a form and came back is a surprise, and one that
   * would happen on every edit.
   */
  const [options, setOptions] = useState<ExportOptions>(PRESETS['cv'].options)

  function onThemeChange(next: ThemePreference) {
    storePreference(next)
    setTheme(next)
  }

  return (
    <SyncProvider>
      <div className="app">
        <header className="app-header">
          <h1>
            {/*
              No aria-label. The visible text is the accessible name, which is what
              voice control needs: a user saying "Career Management Document" is
              saying exactly what is on screen, and overriding the name meant they
              could not. The link's purpose is already clear from the text and its
              position as the first thing in the header.
            */}
            <a className="app-home" href="#/">
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
            {/*
              At the end of the header, after the controls, because it is the least
              used thing here — and the one a reader arrives looking for when they
              want to check who holds their data rather than to do any work.
            */}
            <a
              className="app-nav-link"
              href="#/about"
              aria-current={path === '/about' ? 'page' : undefined}
            >
              About
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
            query,
            from,
            options,
            setOptions,
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
  query: URLSearchParams,
  from: string | null,
  options: ExportOptions,
  setOptions: (next: ExportOptions) => void,
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
  if (newKey) {
    const definition = REGISTRY[newKey]
    /*
     * The parent, when the link named one: "add an achievement under this job"
     * arrives with the job in the query, so the form starts with it filled in
     * rather than asking which job again.
     */
    const seed =
      definition.parent === undefined
        ? undefined
        : { [definition.parent.column]: query.get(definition.parent.query) ?? '' }
    return (
      <RegistryEdit
        registryKey={newKey}
        id={null}
        now={now}
        {...(seed === undefined ? {} : { seed })}
        from={from}
      />
    )
  }

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
    return <RegistryEdit registryKey={editKey} id={id} now={now} from={from} />
  }

  switch (routePath) {
    case '/':
    case '/edit':
      return <AllInOnePage now={now} options={options} onOptionsChange={setOptions} />
    case '/interview':
      return <QuestionsPage now={now} options={options} onOptionsChange={setOptions} />
    case '/document':
      return <DocumentPage now={now} />
    case '/settings':
      return <SettingsPage now={now} theme={theme} onThemeChange={onThemeChange} />
    case '/sync':
      return <SyncPage />
    case '/about':
      return <AboutPage />
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
  '/jobs/new': 'jobs',
  '/achievements/new': 'achievements',
  '/awards/new': 'awards',
  '/education/new': 'education',
  '/phrases/new': 'phrases',
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
  '/phrases/:id/edit': 'phrases',
  '/question-categories/:id/edit': 'questionCategories',
  '/questions/:id/edit': 'questions',
}
