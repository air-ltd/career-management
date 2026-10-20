/**
 * A list of records of one kind.
 *
 * Every list shows deleted records behind a toggle rather than hiding them
 * silently, because a record that has vanished from the app entirely is
 * indistinguishable from a record the user never saved — and "undo" needs
 * something to point at.
 */

import type { ReactNode } from 'react'
import { AddIcon, EditIcon, TrashIcon, UndoIcon } from '../../app/Icons'
import { filterRecords } from './sort'

export interface ListItem {
  id: string
  /** The primary line — company and title, or institution and year. */
  heading: string
  /** The secondary line. Empty renders no `<p>`, so the layout does not jump. */
  detail: string
  deleted: boolean
}

export interface RecordListProps {
  title: string
  items: readonly ListItem[]
  /** The `editHref` for one item, given its id. */
  editHref: (id: string) => string
  /** Absent for an entity with no standalone form; the Add button is then hidden. */
  newHref?: string
  newLabel: string
  showDeleted: boolean
  onToggleShowDeleted: (value: boolean) => void
  /** U7: the search term, and how to change it. Held by the caller so it survives. */
  query: string
  onQueryChange: (value: string) => void
  /** U10: the chosen ordering. "Document order" is the default everywhere. */
  onDelete: (id: string) => void
  /**
   * Brings a deleted record back.
   *
   * A deleted record offers to be recovered rather than deleted again, so the
   * control that undoes the mistake is the one the user is looking for.
   */
  onRecover?: (id: string) => void
  /** Rendered under a row — nested lists, for jobs and their achievements. */
  children?: (id: string) => ReactNode
  emptyText: string
  /** A record with children gets a disclosure instead of a bare "edit" link. */
  childrenLabel?: string
}

export function RecordList({
  title,
  items,
  editHref,
  newHref,
  newLabel,
  showDeleted,
  onToggleShowDeleted,
  query,
  onQueryChange,
  onDelete,
  onRecover,
  children,
  emptyText,
  childrenLabel,
}: RecordListProps) {
  const headingId = `list-${title.replace(/\s+/g, '-').toLowerCase()}`
  const live = showDeleted ? items : items.filter((item) => !item.deleted)
  /*
   * Search the two lines the row actually shows, so a term the user can see in
   * the list is a term that finds the row. Hidden records stay hidden unless Show
   * deleted is on: searching is not a second way to reveal tombstones, because a
   * search that quietly un-hides deleted records makes the two controls
   * unpredictable.
   */
  const visible = filterRecords(live, query, (item) => [item.heading, item.detail])
  const searching = query.trim() !== ''

  return (
    <section className="record-list" aria-labelledby={headingId}>
      <header className="record-list-header">
        <h2 id={headingId}>{title}</h2>
        <div className="button-row">
          {/*
            Hash-prefixed, not a bare path. These are the same routes the router
            matches against `location.hash`; without the `#` the browser makes a
            real request for a path GitHub Pages does not serve, and the link
            404s. `RegistryEdit` and the navigation use the same form.
          */}
          {newHref !== undefined && (
            <a className="button button-primary" href={`#${newHref}`}>
              <AddIcon />
              {newLabel}
            </a>
          )}
          <label className="show-deleted">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => {
                onToggleShowDeleted(event.target.checked)
              }}
            />
            Show hidden
          </label>
        </div>

        <div className="record-list-tools">
          <div className="field">
            <label htmlFor={`${headingId}-search`}>Search {title.toLowerCase()}</label>
            {/*
              `type="search"` for the platform's own clear affordance, and because
              a screen reader announces it as a search field rather than as a text
              box the user has to guess the purpose of.
            */}
            <input
              id={`${headingId}-search`}
              type="search"
              value={query}
              placeholder="Search…"
              onChange={(event) => {
                onQueryChange(event.target.value)
              }}
            />
          </div>
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="hint">
          {/* Two different sentences: "no jobs yet" invites creating one,
              "nothing matches" invites changing the search, and they lead the
              user to opposite places. */}
          {searching ? `Nothing matches “${query.trim()}”.` : emptyText}
        </p>
      ) : (
        <ul className="record-rows">
          {visible.map((item) => (
            <li key={item.id} className={item.deleted ? 'record-row is-deleted' : 'record-row'}>
              <div className="record-row-main">
                <span className="record-row-heading">
                  {/* Deletion is a state, not an absence, so it is named rather
                      than shown as a blank. */}
                  {item.deleted && <span className="badge">hidden</span>}
                  {item.heading}
                </span>
                {item.detail !== '' && <span className="record-row-detail">{item.detail}</span>}
              </div>

              <div className="record-row-actions">
                {children !== undefined && childrenLabel !== undefined && (
                  <a className="button" href={`#${editHref(item.id)}`}>
                    {childrenLabel}
                  </a>
                )}
                <a
                  className="button"
                  href={`#${editHref(item.id)}`}
                  aria-label={`Edit ${item.heading}`}
                >
                  <EditIcon />
                </a>
                {/*
                  A hidden record is offered back rather than hidden again.

                  The button that hid it is replaced rather than joined by a second
                  one: a row with "Hide" and "Recover" side by side reads as a
                  record that is both hidden and not.
                */}
                {item.deleted ? (
                  onRecover !== undefined && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => {
                        onRecover(item.id)
                      }}
                      aria-label={`Recover ${item.heading}`}
                    >
                      <UndoIcon />
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      onDelete(item.id)
                    }}
                    aria-label={`Hide ${item.heading}`}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>

              {children !== undefined && (
                <div className="record-row-children">{children(item.id)}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
