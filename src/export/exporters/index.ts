/**
 * The formats the document can be exported to.
 *
 * D23: Google Docs, OpenDocument, Markdown and plain text are further
 * `DocumentExporter` implementations over the same `DocumentModel`. The first two
 * are not here: Google Docs is a document API rather than a file, and
 * OpenDocument is a zip of XML that is a project in itself.
 *
 * The Word exporter is built and tested and not offered, because the `docx`
 * library is the largest dependency in the project and doubled the page weight
 * for a feature most sessions never reach. It is in `download.ts`, and putting it
 * back is one line.
 */
import { markdownExporter } from './markdown'
import { plainTextExporter } from './plainText'
import type { DocumentExporter } from './types'

export const EXPORTERS: readonly DocumentExporter[] = [markdownExporter, plainTextExporter]
