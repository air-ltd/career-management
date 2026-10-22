/**
 * What the document contains.
 *
 * One card: the sections of the document and what else goes in them. It is one
 * question — "what is in this document?" — and a user asking it should not have
 * to look in two places for the answer.
 */

import { IncludeOptions } from './IncludeOptions'
import type { ExportOptions } from '../../export/model'

export function ContentCard({
  options,
  onOptionsChange,
}: {
  options: ExportOptions
  onOptionsChange: (next: ExportOptions) => void
}) {
  return (
    <div
      className="document-field document-content"
      role="group"
      aria-labelledby="document-content-title"
    >
      <p className="document-content-title" id="document-content-title">
        Content
      </p>

      <IncludeOptions options={options} onChange={onOptionsChange} />
    </div>
  )
}
