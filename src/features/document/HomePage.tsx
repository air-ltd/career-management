/**
 * The home page: a way in, and a way to see what is there.
 *
 * The legacy app opened on the whole document with an edit form per record
 * already in the DOM. This opens on a list of sections with counts, which is
 * both cheaper to render and a better place to start.
 */

import { useEffect, useState } from 'react'
import { db } from '../../storage/db'
import { describeKeySource } from '../../sync/appKey'

interface Counts {
  profiles: number
  jobs: number
  achievements: number
  awards: number
  education: number
  questionCategories: number
  questions: number
}

const EMPTY: Counts = {
  profiles: 0,
  jobs: 0,
  achievements: 0,
  awards: 0,
  education: 0,
  questionCategories: 0,
  questions: 0,
}

export function HomePage() {
  const [counts, setCounts] = useState<Counts>(EMPTY)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [profiles, jobs, achievements, awards, education, categories, questions] =
        await Promise.all([
          db.profiles.toArray(),
          db.jobs.toArray(),
          db.achievements.toArray(),
          db.awards.toArray(),
          db.education.toArray(),
          db.questionCategories.toArray(),
          db.questions.toArray(),
        ])
      if (cancelled) return
      const live = (rows: { deletedAt: string | null }[]) =>
        rows.filter((r) => r.deletedAt === null).length
      setCounts({
        profiles: live(profiles),
        jobs: live(jobs),
        achievements: live(achievements),
        awards: live(awards),
        education: live(education),
        questionCategories: live(categories),
        questions: live(questions),
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * D25 and SY33: the badge and the sync target come from one function, so a dev
   * build pointed at production Dropbox is not something the badge can disagree
   * about. Two answers to "is this production" is how one of them goes stale.
   */
  const { environment } = describeKeySource()

  const total =
    counts.profiles +
    counts.jobs +
    counts.achievements +
    counts.awards +
    counts.education +
    counts.questionCategories +
    counts.questions

  return (
    <section className="home">
      <h2>Your document</h2>
      {environment !== 'production' && (
        <p className="env-notice">
          <span className="badge">{environment}</span> This build is talking to the Dropbox{' '}
          {environment} app, not the live one.
        </p>
      )}

      {total === 0 ? (
        <p className="hint">
          Nothing here yet. Start with a <a href="#/profiles">profile</a> — it supplies the name
          and contact details at the top of the document.
        </p>
      ) : (
        <p className="hint">
          {total} {total === 1 ? 'record' : 'records'} in this browser.
        </p>
      )}

      <ul className="section-cards">
        <SectionCard href="/profiles" label="Profiles" count={counts.profiles} />
        <SectionCard href="/jobs" label="Jobs" count={counts.jobs} />
        <SectionCard href="/achievements" label="Achievements" count={counts.achievements} />
        <SectionCard href="/awards" label="Awards" count={counts.awards} />
        <SectionCard href="/education" label="Education" count={counts.education} />
        <SectionCard
          href="/questions"
          label="Question categories"
          count={counts.questionCategories}
        />
        <SectionCard href="/questions/all" label="Questions" count={counts.questions} />
      </ul>
    </section>
  )
}

function SectionCard({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <li>
      <a className="section-card" href={`#${href}`}>
        <span className="section-card-label">{label}</span>
        <span className="section-card-count">{count}</span>
      </a>
    </li>
  )
}
