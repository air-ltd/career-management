/**
 * The exporter contract (D21).
 *
 * Adding a format is a new module here, not a change to the document view. That
 * is the point of the interface: the view renders a `DocumentModel`, and a
 * format is a function from that model to a file.
 */

import type { DocumentModel } from '../model'

export interface DocumentExporter {
  readonly id: string
  readonly label: string
  /** Shown next to the button, so a choice is never a surprise. */
  readonly description: string
  readonly mediaType: string
  readonly fileExtension: string
  /**
   * Build the document.
   *
   * Every exporter receives the same `DocumentModel`, so a CV is a CV in any
   * format (D49). A format that needs different *content* is a different
   * document, and belongs behind a different preset rather than a flag here.
   */
  build(model: DocumentModel): Promise<Blob>
}
