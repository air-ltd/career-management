/**
 * What the document contains.
 *
 * One card: the sections of the document and what else goes in them. It is one
 * question — "what is in this document?" — and a user asking it should not have
 * to look in two places for the answer.
 */

import { IncludeOptions } from './IncludeOptions'
import { useDisclosure } from './useDisclosure'
import type { ExportOptions } from '../../export/model'

export function ContentCard({
  options,
  onOptionsChange,
}: {
  options: ExportOptions
  onOptionsChange: (next: ExportOptions) => void
}) {
  const { open, setOpen } = useDisclosure('content')

  return (
    <details
      className="document-field document-content"
      open={open}
      onToggle={(event) => {
        setOpen((event.target as HTMLDetailsElement).open)
      }}
    >
      <summary className="document-content-title">Content</summary>

      <IncludeOptions options={options} onChange={onOptionsChange} />
    </details>
  )
}
