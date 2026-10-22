/**
 * The export menu.
 *
 * One button that opens the formats the document can be taken away in, rather than
 * a button per format: the formats are an occasional thing, and a row of them
 * takes more of the rail than the choice deserves.
 *
 * Every format is loaded on demand, the Word one especially. The `docx` library
 * is the largest dependency in the project and it is not what most sessions
 * need, so it is fetched when it is chosen and not before — which is what makes
 * it safe to offer here at all.
 */

import { useState } from 'react'
import { downloadBlob } from '../../export/exporters/download'
import { ShareIcon } from '../../app/Icons'
import type { DocumentModel } from '../../export/model'

interface ExportFormat {
  id: string
  label: string
  /** What it is, for the tooltip. */
  description: string
  extension: string
  /** Loaded when the format is chosen, not before. */
  load: () => Promise<{ build: (model: DocumentModel) => Promise<Blob> }>
}

const FORMATS: ExportFormat[] = [
  {
    id: 'markdown',
    label: 'Markdown',
    description: 'A .md file — for a repository, a notebook or a wiki.',
    extension: 'md',
    load: () => import('../../export/exporters/markdown').then((m) => m.markdownExporter),
  },
  {
    id: 'text',
    label: 'Plain text',
    description: 'A .txt file — for an email or a form that takes nothing else.',
    extension: 'txt',
    load: () => import('../../export/exporters/plainText').then((m) => m.plainTextExporter),
  },
  {
    id: 'docx',
    label: 'Word',
    description: 'A .docx file — a real Word document, not a picture of this one.',
    extension: 'docx',
    load: () => import('../../export/exporters/docx').then((m) => m.docxExporter),
  },
]

export function ExportMenu({ model }: { model: DocumentModel }) {
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)

  const exportAs = async (format: ExportFormat) => {
    setOpen(false)
    setWorking(true)
    try {
      const exporter = await format.load()
      const blob = await exporter.build(model)
      downloadBlob(blob, `career-management-document.${format.extension}`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <details
      className="export-menu"
      open={open}
      onToggle={(event) => {
        setOpen((event.target as HTMLDetailsElement).open)
      }}
    >
      {/*
        An icon rather than a word, so it sits on the same line as the print
        button beside it. The name is on the control for anyone who cannot see
        the glyph.
      */}
      <summary
        className="button button-icon"
        aria-label="Export"
        title="Export — Markdown, plain text or Word"
        aria-busy={working}
      >
        <ShareIcon />
      </summary>
      <ul className="export-menu-list">
        {FORMATS.map((format) => (
          <li key={format.id}>
            <button
              type="button"
              className="button"
              title={format.description}
              onClick={() => {
                void exportAs(format)
              }}
            >
              {format.label}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
