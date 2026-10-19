/**
 * Inline SVG icons.
 *
 * Inline rather than an icon font or sprite sheet: there are eight of them, an
 * external request each would be one more thing to load and to keep in step with
 * the CSP, and `currentColor` means theming is free.
 *
 * Every icon is decorative and marked `aria-hidden`. The control that wraps it
 * carries the accessible name, so a screen reader announces "Add job" rather
 * than announcing an image and the label separately.
 */

type IconProps = {
  size?: number
}

function icon(path: React.ReactNode, viewBox = '0 0 24 24') {
  return function Icon({ size = 18 }: IconProps) {
    return (
      <svg
        className="icon"
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {path}
      </svg>
    )
  }
}

export const AddIcon = icon(
  <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>,
)

export const EditIcon = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
)

export const TrashIcon = icon(
  <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>,
)

export const UndoIcon = icon(
  <>
    <polyline points="9 14 4 9 9 4" />
    <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
  </>,
)

export const ChevronIcon = icon(<polyline points="6 9 12 15 18 9" />)

export const PrintIcon = icon(
  <>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </>,
)

export const DownloadIcon = icon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </>,
)

/**
 * Settings.
 *
 * The gear outline rather than the filled one: every other icon here is a stroked
 * outline, and a solid gear beside them would read as a different kind of thing.
 */
/**
 * Dropbox.
 *
 * A cloud with an upward stroke through it, for the sync indicator: the upward
 * stroke is what says this one uploads rather than simply being a shape for a
 * computer, and it leaves room for the small state glyph in its corner.
 */
export const CloudIcon = icon(
  <>
    <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.7A4 4 0 0 0 7 19.5Z" />
    <path d="M12 12v5" />
    <polyline points="9.5 14.5 12 12 14.5 14.5" />
  </>,
)

export const SettingsIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
)

export const DocumentIcon = icon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <polyline points="14 2 14 8 20 8" />
  </>,
)
