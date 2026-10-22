/**
 * Saving a generated document to disk.
 *
 * Separate from the page that offers it, so the export path can be kept intact
 * while the control that triggers it is not shown. The exporter and its tests are
 * unchanged; reinstating the button is one line on the page.
 */

import type { DocumentModel } from '../model'
import type { DocumentExporter } from './types'

/** Hand a blob to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // Revoked on the next tick, so the download has begun before it is released.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

/**
 * Build a document in a format and download it.
 *
 * The model goes in and a file comes out, and nothing in between decides what the
 * document is: the format is a function of the model (D21, D39).
 */
export async function downloadFrom(
  exporter: DocumentExporter,
  model: DocumentModel,
): Promise<void> {
  const blob = await exporter.build(model)
  downloadBlob(blob, `career-management-document.${exporter.fileExtension}`)
}

/**
 * Build the Word document from a model and download it.
 *
 * `docx` is loaded on demand: it is by far the largest dependency in the project,
 * and bundling it eagerly made the initial page weight roughly double for a
 * feature most sessions never reach.
 *
 * The model is passed in rather than resolved here, so this module knows how to
 * save a document and nothing about how one is put together.
 */
export async function downloadDocxFrom(model: DocumentModel): Promise<void> {
  const { docxExporter } = await import('./docx')
  const blob = await docxExporter.build(model)
  downloadBlob(blob, 'career-management-document.docx')
}
