/**
 * A list of records of one kind.
 *
 * Every list shows deleted records behind a toggle rather than hiding them
 * silently, because a record that has vanished from the app entirely is
 * indistinguishable from a record the user never saved — and "undo" needs
 * something to point at.
 */

import type { ReactNode } from 'react'
import { AddIcon, EditIcon, TrashIcon } from '../../app/Icons'

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
  newHref: string
  newLabel: string
  showDeleted: boolean
  onToggleShowDeleted: (value: boolean) => void
  onDelete: (id: string) => void
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
  onDelete,
  children,
  emptyText,
  childrenLabel,
}: RecordListProps) {
  const headingId = `list-${title.replace(/\s+/g, '-').toLowerCase()}`
  const visible = showDeleted ? items : items.filter((item) => !item.deleted)

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
          <a className="button button-primary" href={`#${newHref}`}>
            <AddIcon />
            {newLabel}
          </a>
          <label className="show-deleted">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => {
                onToggleShowDeleted(event.target.checked)
              }}
            />
            Show deleted
          </label>
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="hint">{emptyText}</p>
      ) : (
        <ul className="record-rows">
          {visible.map((item) => (
            <li key={item.id} className={item.deleted ? 'record-row is-deleted' : 'record-row'}>
              <div className="record-row-main">
                <span className="record-row-heading">
                  {/* Deletion is a state, not an absence, so it is named rather
                      than shown as a blank. */}
                  {item.deleted && <span className="badge">deleted</span>}
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
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    onDelete(item.id)
                  }}
                  aria-label={`Delete ${item.heading}`}
                >
                  <TrashIcon />
                </button>
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
